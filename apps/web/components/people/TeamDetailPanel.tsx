"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { InlineText } from "@/components/people/InlineText";
import { PersonPicker, type PersonChoice } from "@/components/people/PersonPicker";
import { useRefreshPeople, useResolvePerson } from "@/components/people/usePeople";
import {
  BulkAssignDialog,
  ownerOptions,
  useOwnershipData,
  useOwnershipWrite,
} from "@/components/mvp/OwnersPage";
import { ROLE_CHIP, groupByType, roleLabel, teamOwnedRows } from "@/lib/ownership";
import { alsoLinked } from "@/lib/people";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { OwnerRef, OwnershipBulkRequest, TeamUpdate } from "@minea/types";

const selectClass =
  "rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#1c2230]";
const sectionLabel = "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]";

interface Props {
  teamId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function TeamDetailPanel({ teamId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(teamId);
  const data = useOwnershipData();
  const write = useOwnershipWrite();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const resolvePerson = useResolvePerson();
  const refreshPeople = useRefreshPeople();

  const { data: team, isLoading } = useQuery({
    queryKey: ["people-team", orgSlug, workspaceSlug, teamId],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.getTeam(orgSlug, workspaceSlug, teamId, token!);
    },
    enabled,
  });

  const refreshTeam = () =>
    queryClient.invalidateQueries({ queryKey: ["people-team", orgSlug, workspaceSlug, teamId] });

  const saveMutation = useMutation({
    mutationFn: async (body: TeamUpdate) => {
      const token = await getToken();
      return peopleApi.updateTeam(orgSlug, workspaceSlug, teamId, body, token!);
    },
    onSuccess: () => {
      refreshTeam();
      queryClient.invalidateQueries({ queryKey: ["people-teams", orgSlug, workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      // The lead shows as the contact on records that have only this team.
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      onUpdate();
    },
    onError: (e: Error) =>
      toast({ title: "Could not save team", description: e.message, variant: "destructive" }),
  });

  const memberCall = useMutation({
    mutationFn: async (fn: (token: string) => Promise<unknown>) => fn((await getToken())!),
    onSuccess: () => {
      refreshTeam();
      refreshPeople();
      onUpdate();
    },
    onError: (e: Error) => toast({ title: "Could not update members", description: e.message, variant: "destructive" }),
  });

  const addMember = (choice: PersonChoice) =>
    memberCall.mutate((t) =>
      peopleApi.addTeamMember(
        orgSlug,
        workspaceSlug,
        teamId,
        "create" in choice ? choice.create : { contact_id: choice.contactId! },
        t,
      ),
    );

  const pickLead = async (choice: PersonChoice) => {
    try {
      const id = await resolvePerson(choice);
      saveMutation.mutate({ lead_contact_id: id });
    } catch (e) {
      toast({ title: "Could not add person", description: (e as Error).message, variant: "destructive" });
    }
  };

  const owner: OwnerRef = { type: "team", id: teamId };
  const owned = teamOwnedRows(data.items, teamId);
  const groups = groupByType(owned, (r) => r.item.type, (r) => r.item.name);
  const members = team?.members ?? [];
  const targets = ownerOptions(data.teams, data.contacts).filter(
    (o) => o.value !== `team:${teamId}`,
  );
  const linked = alsoLinked(team?.accountabilities ?? []);

  const run = (body: Omit<OwnershipBulkRequest, "owner">, done: string) =>
    write.mutate(
      { ...body, owner },
      {
        onSuccess: () => {
          toast({ title: done });
          setPicked(new Set());
          setMoveTo("");
        },
      },
    );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 left-[200px] z-50 flex flex-col overflow-hidden bg-white text-[#1c2230]">
        <div className="flex-1 overflow-y-auto px-8 pb-24 pt-6">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">PEOPLE · TEAM</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[#8b90a0] hover:bg-black/5"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {isLoading || !team ? (
            <p className="mt-6 text-[13px] text-[#8b90a0]">Loading team…</p>
          ) : (
            <>
              <h1 className="mt-1 text-[22px] font-semibold">
                <InlineText
                  label="Team name"
                  value={team.name}
                  placeholder="Team name"
                  onSave={(name) => name && saveMutation.mutate({ name })}
                />
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-4 text-[13px] text-[#5b6170]">
                <span className="flex items-center gap-1.5">
                  <span className="text-[#8b90a0]">Lead</span>
                  <PersonPicker
                    label="Team lead"
                    people={data.contacts}
                    value={team.lead_contact_id}
                    legacyName={team.lead_name}
                    placeholder="No lead"
                    noneLabel="No lead"
                    createLabel="Create and make lead"
                    disabled={saveMutation.isPending}
                    onPick={pickLead}
                  />
                </span>
                <span>
                  <span className="text-[#8b90a0]">Members</span> {members.length}
                </span>
                <span>
                  <span className="text-[#8b90a0]">Owns</span>{" "}
                  {owned.length ? `${owned.length} record${owned.length === 1 ? "" : "s"}` : "nothing yet"}
                </span>
              </div>
              <div className="mt-3 max-w-3xl text-[13px] text-[#5b6170]">
                <InlineText
                  label="Description"
                  multiline
                  value={team.description ?? ""}
                  placeholder="Add a description"
                  onSave={(description) => saveMutation.mutate({ description: description || null })}
                />
              </div>

              <div className="mb-2 mt-6 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Members</h2>
                <PersonPicker
                  label="Add member"
                  align="right"
                  people={data.contacts}
                  excludeIds={members.map((m) => m.contact_id)}
                  placeholder="+ Add member…"
                  withTitle="Title on this team"
                  createLabel="Create and add"
                  onPick={addMember}
                  className="min-w-[180px]"
                />
              </div>
              {members.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#d6d9e2] px-4 py-4 text-[13px] text-[#8b90a0]">
                  No members yet. Add people already in People, or type a new name.
                </p>
              ) : (
                <table className="w-full overflow-hidden rounded-lg border border-[#e6e8ee] text-[13px]">
                  <thead className="bg-[#fafbfc] text-left text-[11px] uppercase tracking-[0.1em] text-[#8b90a0]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Member</th>
                      <th className="px-3 py-2 font-semibold">Title on this team</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="w-20 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f1f5]">
                    {members.map((m) => (
                      <tr key={m.contact_id}>
                        <td className="px-3 py-2 font-medium">
                          {m.name}
                          {m.contact_id === team.lead_contact_id && <span className="ml-1.5 text-[12px] font-normal text-[#8b90a0]">lead</span>}
                        </td>
                        <td className="px-3 py-2 text-[#5b6170]">
                          <InlineText
                            label={`Title for ${m.name}`}
                            value={m.title ?? ""}
                            placeholder={m.job_title || "Add title"}
                            onSave={(title) =>
                              memberCall.mutate((t) => peopleApi.updateTeamMember(orgSlug, workspaceSlug, teamId, m.contact_id, title || null, t))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-[#5b6170]">{m.email || <span className="text-[#b4b8c4]">—</span>}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => memberCall.mutate((t) => peopleApi.removeTeamMember(orgSlug, workspaceSlug, teamId, m.contact_id, t))}
                            className="text-[12px] text-[#8b90a0] hover:text-red-600"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="mb-3 mt-7 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">What this team owns</h2>
                {owned.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAssigning(true)}
                    className="rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white"
                  >
                    Assign objects
                  </button>
                )}
              </div>

              {data.loading ? (
                <p className="text-[13px] text-[#8b90a0]">Loading…</p>
              ) : data.failed ? (
                <p className="text-[13px] text-red-600">Could not load owners. Reload to try again.</p>
              ) : owned.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d6d9e2] px-6 py-10 text-center text-[13px] text-[#5b6170]">
                  <p className="mb-1 text-[15px] font-semibold text-[#1c2230]">
                    This team doesn&apos;t own anything yet
                  </p>
                  <p>Assign records as Business, Technical or Support owner.</p>
                  <button
                    type="button"
                    onClick={() => setAssigning(true)}
                    className="mt-4 rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white"
                  >
                    Assign objects
                  </button>
                  {data.unowned > 0 && (
                    <p className="mt-2 text-[12px] text-[#8b90a0]">{data.unowned} records have no owner</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map((g) => (
                    <section key={g.label}>
                      <p className={cn(sectionLabel, "mb-1.5")}>
                        {g.label} · {g.items.length}
                      </p>
                      <ul className="divide-y divide-[#f0f1f5] rounded-lg border border-[#e6e8ee]">
                        {g.items.map(({ item, roles }) => (
                          <li key={item.object_id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px]",
                                picked.has(item.object_id) && "bg-[#fafaff]",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={picked.has(item.object_id)}
                                onChange={() => toggle(item.object_id)}
                              />
                              <span className="flex-1 font-medium">{item.name}</span>
                              <span className="flex flex-col items-end gap-1">
                                {roles.map((r) => (
                                  <span key={r.role} className="flex items-center gap-3">
                                    <span
                                      title={roleLabel(r.role)}
                                      className={cn(
                                        "w-[72px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold",
                                        ROLE_CHIP[r.role].className,
                                      )}
                                    >
                                      {ROLE_CHIP[r.role].label}
                                    </span>
                                    <span className="w-[190px] truncate text-[#5b6170]">
                                      {r.contact || <span className="text-[#b4b8c4]">No contact</span>}
                                      {r.isLead && <span className="text-[#8b90a0]"> (lead)</span>}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}

              {linked && (
                <p className="mt-6 border-t border-[#e6e8ee] pt-3 text-[13px] text-[#5b6170]">
                  <span className="text-[#8b90a0]">Also linked:</span> {linked}
                </p>
              )}
            </>
          )}
        </div>

        {picked.size > 0 && (
          <div className="flex items-center gap-2 border-t border-[#e6e8ee] bg-white px-8 py-3 text-[13px]">
            <span className="font-semibold">{picked.size} selected</span>
            <select
              aria-label="Move to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className={cn(selectClass, "ml-auto")}
            >
              <option value="">Move to…</option>
              {targets.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!moveTo || write.isPending}
              onClick={() => {
                const [type, id] = moveTo.split(":") as [OwnerRef["type"], string];
                run({ action: "move", object_ids: [...picked], target: { type, id } }, `Moved ${picked.size}`);
              }}
              className="rounded-md bg-[#5b4ce6] px-3 py-1.5 font-medium text-white disabled:opacity-40"
            >
              Move
            </button>
            <button
              type="button"
              disabled={write.isPending}
              onClick={() => run({ action: "remove", object_ids: [...picked] }, `Removed from ${picked.size}`)}
              className="rounded-md border border-[#e6e8ee] px-3 py-1.5 font-medium text-red-600"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="rounded-md border border-[#e6e8ee] px-3 py-1.5"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {assigning && team && (
        <BulkAssignDialog
          title={`Assign to ${team.name}`}
          items={data.items}
          onClose={() => setAssigning(false)}
          pending={write.isPending}
          onSave={(ids, role) =>
            write.mutate(
              { action: "assign", object_ids: ids, role, owner },
              {
                onSuccess: () => {
                  toast({ title: `Assigned ${ids.length} as ${roleLabel(role)}` });
                  setAssigning(false);
                },
              },
            )
          }
        />
      )}

    </>
  );
}
