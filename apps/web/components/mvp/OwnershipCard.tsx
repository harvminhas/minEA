"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ObjectOwnershipWrite, OwnershipRole } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { toast } from "@/hooks/use-toast";
import { OWNERSHIP_ROLES, holderLabel } from "@/lib/ownership";
import { useOwnershipData } from "@/components/mvp/OwnersPage";
import { PersonPicker } from "@/components/people/PersonPicker";
import { useResolvePerson } from "@/components/people/usePeople";

const selectClass =
  "min-w-0 flex-1 rounded-md border border-[#e6e8ee] bg-white px-2 py-1 text-[12px] text-[#1c2230]";

type Draft = Record<OwnershipRole, { team_id: string; contact_id: string }>;

/** Read-only Business / Technical / Support owners with a small editor behind Change. */
export function OwnershipCard({
  objectId,
  canEdit,
  openEditor,
  openRound = 0,
  onDone,
}: {
  objectId: string;
  canEdit: boolean;
  /** The record was opened at its owner (Owner column "+ Add", ?focus=owner): open the editor. */
  openEditor?: boolean;
  /** Bumps when "+ Add" asks again for the panel already open, so the editor reopens. */
  openRound?: number;
  /** Editor closed (saved or cancelled). */
  onDone?: () => void;
}) {
  const data = useOwnershipData();
  const item = data.items.find((i) => i.object_id === objectId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const qc = useQueryClient();
  const resolvePerson = useResolvePerson();

  useEffect(() => {
    if (openEditor && canEdit) setEditing(true);
  }, [openEditor, openRound, canEdit]);

  const close = () => {
    setEditing(false);
    setDraft(null);
    onDone?.();
  };

  // Start the draft once per edit; an unowned record (or one the list has not loaded yet) starts empty.
  useEffect(() => {
    if (!editing || draft) return;
    const d = {} as Draft;
    for (const r of OWNERSHIP_ROLES) {
      const h = item?.roles[r.key];
      d[r.key] = {
        team_id: h?.team_id ?? "",
        contact_id: h && !h.contact_is_lead ? (h.contact_id ?? "") : "",
      };
    }
    setDraft(d);
  }, [editing, item, draft]);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const roles: ObjectOwnershipWrite["roles"] = {};
      for (const r of OWNERSHIP_ROLES) {
        const v = d[r.key];
        roles[r.key] =
          v.team_id || v.contact_id
            ? { team_id: v.team_id || null, contact_id: v.contact_id || null }
            : null;
      }
      return peopleApi.setObjectOwnership(
        orgSlug!,
        workspaceSlug!,
        objectId,
        { roles },
        (await getToken())!,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ownership"] });
      qc.invalidateQueries({ queryKey: ["model-catalog"] });
      close();
    },
    onError: (e: Error) =>
      toast({
        title: "Could not save owners",
        description: e.message,
        variant: "destructive",
      }),
  });

  return (
    // data-field-key: the panel scrolls to and flashes this when opened at ?focus=owner.
    <section data-field-key="owner">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">
          OWNERSHIP
        </h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[12px] font-medium text-[#5b4ce6]"
          >
            Change
          </button>
        )}
      </div>
      {data.failed && (
        <p className="text-[12px] text-amber-700">Couldn't load owners. Try again in a moment.</p>
      )}
      {!editing && (
        <dl className="space-y-1 text-[13px]">
          {OWNERSHIP_ROLES.map((r) => (
            <div key={r.key} className="flex gap-3">
              <dt className="w-32 shrink-0 text-[#8b90a0]">{r.label}</dt>
              <dd className="text-[#1c2230]">
                {holderLabel(item?.roles[r.key]) || (
                  <span className="text-[#b4b8c4]">—</span>
                )}
              </dd>
            </div>
          ))}
          {item?.legacy_owner && (
            <p className="text-[12px] text-[#8b90a0]">
              Owner (old text): {item.legacy_owner}
            </p>
          )}
        </dl>
      )}
      {editing && draft && (
        <div className="space-y-1.5">
          {OWNERSHIP_ROLES.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[12px] text-[#8b90a0]">
                {r.label}
              </span>
              <select
                aria-label={`${r.label} team`}
                value={draft[r.key].team_id}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [r.key]: { ...draft[r.key], team_id: e.target.value },
                  })
                }
                className={selectClass}
              >
                <option value="">No team</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <PersonPicker
                label={`${r.label} person`}
                people={data.contacts}
                value={draft[r.key].contact_id || null}
                placeholder={draft[r.key].team_id ? "Team lead" : "No person"}
                noneLabel={draft[r.key].team_id ? "Team lead" : "No person"}
                createLabel="Create and pick"
                className="min-w-0 flex-1 text-[12px]"
                onPick={async (choice) => {
                  try {
                    const id = await resolvePerson(choice);
                    setDraft((d) => d && { ...d, [r.key]: { ...d[r.key], contact_id: id ?? "" } });
                  } catch (e) {
                    toast({ title: "Could not add person", description: (e as Error).message, variant: "destructive" });
                  }
                }}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-md px-2.5 py-1 text-[12px] text-[#5b6170]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(draft)}
              className="rounded-md bg-[#5b4ce6] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
