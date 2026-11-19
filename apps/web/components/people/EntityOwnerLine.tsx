"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityAccountability, MinEAObject } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { accountabilityEntityKindOf } from "@/lib/people-utils";
import { ownerLineLabel, resolveEntityOwners, type EntityOwnerRef } from "@/lib/entity-owner";
import { PersonPicker, type PersonChoice } from "@/components/people/PersonPicker";
import { useResolvePerson } from "@/components/people/usePeople";
import { cn } from "@/lib/utils";

async function addOwnerAccountability(
  orgSlug: string,
  workspaceSlug: string,
  token: string,
  entityKind: string,
  entityId: string,
  subject: { type: "contact" | "team"; id: string }
) {
  const body = { entity_kind: entityKind, entity_id: entityId, link_kind: "owns" as const };
  if (subject.type === "contact") {
    await peopleApi.addContactAccountability(orgSlug, workspaceSlug, subject.id, body, token);
  } else {
    await peopleApi.addTeamAccountability(orgSlug, workspaceSlug, subject.id, body, token);
  }
}

export function EntityOwnerLine({
  objectId,
  objectType,
  object,
  canEdit = false,
  openEditor = false,
  className,
}: {
  objectId: string;
  objectType: string;
  object?: Pick<
    MinEAObject,
    "owner" | "owner_team_id" | "owner_team_name" | "point_of_contact_id" | "point_of_contact_name"
  > | null;
  canEdit?: boolean;
  openEditor?: boolean;
  className?: string;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug, objectId);
  const entityKind = accountabilityEntityKindOf(objectType) ?? objectType;
  const resolvePerson = useResolvePerson();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (openEditor) setOpen(true);
  }, [openEditor]);

  const accQuery = useQuery({
    queryKey: ["entity-accountabilities", orgSlug, workspaceSlug, entityKind, objectId],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { items: [] as EntityAccountability[] };
      return peopleApi.listEntityAccountabilities(orgSlug, workspaceSlug, entityKind, objectId, token);
    },
  });
  const roleQuery = useQuery({
    queryKey: ["entity-accountabilities", orgSlug, workspaceSlug, "object", objectId],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { items: [] as EntityAccountability[] };
      return peopleApi.listEntityAccountabilities(orgSlug, workspaceSlug, "object", objectId, token);
    },
  });
  const peopleQuery = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug],
    enabled: enabled && open,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { items: [] };
      return peopleApi.listContacts(orgSlug, workspaceSlug, token);
    },
  });
  const teamsQuery = useQuery({
    queryKey: ["people-teams", orgSlug, workspaceSlug],
    enabled: enabled && open,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { items: [] };
      return peopleApi.listTeams(orgSlug, workspaceSlug, token);
    },
  });

  const resolved = resolveEntityOwners({
    accountabilities: accQuery.data?.items,
    roleAccountabilities: roleQuery.data?.items,
    object,
  });
  const label = ownerLineLabel(resolved.owners);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["entity-accountabilities"] });
    void queryClient.invalidateQueries({ queryKey: ["capability-mapping-lists"] });
  };

  const run = async (work: (token: string) => Promise<void>) => {
    if (!orgSlug || !workspaceSlug) return;
    setError("");
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in to make changes.");
      await work(token);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the owner.");
    } finally {
      setBusy(false);
    }
  };

  const replaceWith = async (subject: { type: "contact" | "team"; id: string }) => {
    await run(async (token) => {
      const existing = (accQuery.data?.items ?? []).filter(
        (item) => item.link_kind === "owns" || item.link_kind === "manages" || item.link_kind === "stewards"
      );
      const already = existing.find((item) => item.subject_id === subject.id && item.subject_type === subject.type);
      if (!already) {
        await addOwnerAccountability(orgSlug!, workspaceSlug!, token, entityKind, objectId, subject);
      }
      for (const item of existing) {
        if (already && item.id === already.id) continue;
        if (item.subject_id === subject.id && item.subject_type === subject.type) continue;
        await peopleApi.deleteAccountability(orgSlug!, workspaceSlug!, item.id, token);
      }
    });
    setOpen(false);
  };

  const onPickPerson = async (choice: PersonChoice) => {
    if ("contactId" in choice && choice.contactId === null) return;
    const id = await resolvePerson(choice);
    if (!id) return;
    await replaceWith({ type: "contact", id });
  };

  const onPickTeam = async (teamId: string) => {
    if (!teamId) return;
    await replaceWith({ type: "team", id: teamId });
  };

  const onRemove = async (owner: EntityOwnerRef) => {
    if (!owner.accountabilityId || owner.source !== "accountability") return;
    await run(async (token) => {
      await peopleApi.deleteAccountability(orgSlug!, workspaceSlug!, owner.accountabilityId!, token);
    });
  };

  return (
    <div className={cn("mt-0.5 text-[13px] text-[#6b7289]", className)} data-testid="entity-owner-line">
      <span>Owner: </span>
      <span className={label ? "font-medium text-[#1c2230]" : ""} data-testid="entity-owner-name">
        {label ?? "No owner"}
      </span>
      {canEdit ? (
        <>
          <span className="text-[#c0c3cc]"> · </span>
          <button
            type="button"
            data-testid="entity-owner-change"
            onClick={() => setOpen((value) => !value)}
            className="font-semibold text-[#5b4ce6]"
          >
            Change
          </button>
        </>
      ) : null}
      {open && canEdit ? (
        <div
          className="relative z-20 mt-2 max-w-sm rounded-lg border border-[#e6e8ee] bg-white p-3 shadow-sm"
          data-testid="entity-owner-editor"
        >
          {resolved.owners.length > 0 ? (
            <ul className="mb-2 space-y-1">
              {resolved.owners.map((owner) => (
                <li key={`${owner.subjectType}:${owner.subjectId || owner.name}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-[#1c2230]">{owner.name}</span>
                  {owner.accountabilityId && owner.source === "accountability" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRemove(owner)}
                      className="text-[#9a3412]"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-[#8b90a0]">Shown until assigned</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <PersonPicker
            people={peopleQuery.data?.items ?? []}
            onPick={(choice) => void onPickPerson(choice)}
            label="Owner"
            placeholder="Assign a person…"
            disabled={busy}
          />
          <label className="mt-2 block text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">
            OR A TEAM
            <select
              className="mt-1 w-full rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#1c2230] outline-none focus:border-[#c9c3f7]"
              defaultValue=""
              disabled={busy}
              aria-label="Assign owner team"
              onChange={(event) => {
                const id = event.target.value;
                event.target.value = "";
                if (id) void onPickTeam(id);
              }}
            >
              <option value="">Assign a team…</option>
              {(teamsQuery.data?.items ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
