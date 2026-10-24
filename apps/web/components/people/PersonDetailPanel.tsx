"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import type { OwnerRef, PeopleContactUpdate } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { BulkAssignDialog, useOwnershipData, useOwnershipWrite } from "@/components/mvp/OwnersPage";
import { InlineText } from "@/components/people/InlineText";
import { LeavingDialog } from "@/components/people/LeavingDialog";
import { useRefreshPeople } from "@/components/people/usePeople";
import { ROLE_CHIP, groupByType, roleLabel } from "@/lib/ownership";
import { personOwns, teamsLedBy, teamsOf, type PersonOwnedRow } from "@/lib/people";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const sectionLabel = "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]";

function OwnedList({ title, rows, note }: { title: string; rows: PersonOwnedRow[]; note?: string }) {
  if (!rows.length) return null;
  const groups = groupByType(rows, (r) => r.item.type, (r) => r.item.name);
  return (
    <section className="space-y-2">
      <p className={sectionLabel}>
        {title} · {rows.length}
        {note && <span className="ml-2 normal-case tracking-normal text-[#b4b8c4]">{note}</span>}
      </p>
      {groups.map((g) => (
        <ul key={g.label} className="divide-y divide-[#f0f1f5] rounded-lg border border-[#e6e8ee]">
          {g.items.map(({ item, roles }) => (
            <li key={item.object_id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="text-[12px] text-[#8b90a0]">{g.label}</span>
              <span className="flex flex-col items-end gap-1">
                {roles.map((r) => (
                  <span key={r.role} className="flex items-center gap-2">
                    <span title={roleLabel(r.role)} className={cn("w-[72px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold", ROLE_CHIP[r.role].className)}>
                      {ROLE_CHIP[r.role].label}
                    </span>
                    <span className="w-[120px] truncate text-[#5b6170]">{r.team || "—"}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

/** A person: details edited in place, their teams, and what they own directly or as a team lead. */
export function PersonDetailPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled(contactId);
  const data = useOwnershipData();
  const write = useOwnershipWrite();
  const refresh = useRefreshPeople();
  const [assigning, setAssigning] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeam, setNewTeam] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: person, isLoading } = useQuery({
    queryKey: ["people-contact", orgSlug, workspaceSlug, contactId],
    enabled,
    queryFn: async () => peopleApi.getContact(orgSlug, workspaceSlug, contactId, (await getToken())!),
  });

  const call = useMutation({
    mutationFn: async (fn: (token: string) => Promise<unknown>) => fn((await getToken())!),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });
  const save = (body: PeopleContactUpdate) =>
    call.mutate((t) => peopleApi.updateContact(orgSlug, workspaceSlug, contactId, body, t));

  const owner: OwnerRef = { type: "contact", id: contactId };
  const { direct, viaTeam } = personOwns(data.items, contactId);
  const teams = person ? teamsOf(person) : [];
  const led = teamsLedBy(data.teams, contactId);
  const first = person?.name.split(" ")[0] ?? "";
  const joinable = data.teams.filter((t) => !teams.some((m) => m.id === t.id));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 left-[200px] right-0 z-50 flex flex-col overflow-hidden bg-white text-[#1c2230]">
        <div className="flex-1 overflow-y-auto px-8 pb-24 pt-6">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">PEOPLE · PERSON</p>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[#8b90a0] hover:bg-black/5" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          {isLoading || !person ? (
            <p className="mt-6 text-[13px] text-[#8b90a0]">Loading…</p>
          ) : (
            <>
              <h1 className="mt-1 text-[22px] font-semibold">
                <InlineText label="Name" value={person.name} placeholder="Name" onSave={(name) => name && save({ name })} />
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-[#5b6170]">
                <InlineText label="Title" value={person.title ?? ""} placeholder="Add title" onSave={(title) => save({ title: title || null })} />
                <InlineText label="Email" value={person.email ?? ""} placeholder="Add email" onSave={(email) => save({ email: email || "" })} />
                <InlineText label="Phone" value={person.phone ?? ""} placeholder="Add phone" onSave={(phone) => save({ phone: phone || null })} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-[#8b90a0]">Teams</span>
                {teams.length === 0 && <span className="text-[#b4b8c4]">Not on a team</span>}
                {teams.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-[#f4f5f8] py-0.5 pl-2.5 pr-1">
                    {t.name}
                    {t.title && <span className="text-[#8b90a0]">· {t.title}</span>}
                    {led.some((l) => l.id === t.id) && <span className="text-[#8b90a0]">· lead</span>}
                    <button
                      type="button"
                      aria-label={`Remove from ${t.name}`}
                      onClick={() => call.mutate((tok) => peopleApi.removeTeamMember(orgSlug, workspaceSlug, t.id, contactId, tok))}
                      className="rounded-full p-0.5 text-[#8b90a0] hover:bg-black/5"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {addingTeam ? (
                  <span className="inline-flex items-center gap-1.5">
                    <select
                      aria-label="Add to team"
                      autoFocus
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const teamId = e.target.value;
                        call.mutate((tok) => peopleApi.addTeamMember(orgSlug, workspaceSlug, teamId, { contact_id: contactId }, tok));
                        setAddingTeam(false);
                      }}
                      className="rounded-md border border-[#e6e8ee] px-2 py-1 text-[13px]"
                    >
                      <option value="">Pick a team…</option>
                      {joinable.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <input
                      aria-label="New team"
                      value={newTeam}
                      onChange={(e) => setNewTeam(e.target.value)}
                      placeholder="or new team…"
                      className="w-[140px] rounded-md border border-[#e6e8ee] px-2 py-1 text-[13px]"
                    />
                    <button
                      type="button"
                      disabled={!newTeam.trim()}
                      onClick={() => {
                        const name = newTeam.trim();
                        call.mutate(async (tok) => {
                          const team = await peopleApi.createTeam(orgSlug, workspaceSlug, { name }, tok);
                          return peopleApi.addTeamMember(orgSlug, workspaceSlug, team.id, { contact_id: contactId }, tok);
                        });
                        setNewTeam("");
                        setAddingTeam(false);
                      }}
                      className="rounded-md bg-[#5b4ce6] px-2.5 py-1 text-white disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button type="button" onClick={() => setAddingTeam(false)} className="text-[#8b90a0]">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setAddingTeam(true)} className="inline-flex items-center gap-1 text-[#5b4ce6]">
                    <Plus size={13} /> Add to team
                  </button>
                )}
              </div>

              <div className="mb-3 mt-7 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">What {first} owns</h2>
                <div className="flex gap-2">
                  {(direct.length > 0 || led.length > 0) && (
                    <button type="button" onClick={() => setLeaving(true)} className="rounded-md border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium">
                      Move everything to…
                    </button>
                  )}
                  <button type="button" onClick={() => setAssigning(true)} className="rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white">
                    Assign objects
                  </button>
                </div>
              </div>
              {data.loading ? (
                <p className="text-[13px] text-[#8b90a0]">Loading…</p>
              ) : direct.length + viaTeam.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d6d9e2] px-6 py-10 text-center text-[13px] text-[#5b6170]">
                  <p className="mb-1 text-[15px] font-semibold text-[#1c2230]">{first} doesn&apos;t own anything yet</p>
                  <p>Name them as Business, Technical or Support owner, or make them lead of a team that owns records.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <OwnedList title="Directly" rows={direct} />
                  <OwnedList title="Via team (as lead)" rows={viaTeam} note="follows whoever leads the team" />
                </div>
              )}

              <div className="mt-10 border-t border-[#e6e8ee] pt-4 text-[13px]">
                {confirmDelete ? (
                  <span className="flex items-center gap-3">
                    <span>Delete {person.name}? Records they own keep their team.</span>
                    <button
                      type="button"
                      onClick={() => {
                        call.mutate((t) => peopleApi.deleteContact(orgSlug, workspaceSlug, contactId, t));
                        onClose();
                      }}
                      className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-[#8b90a0]">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="text-red-600">
                    Delete person
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {assigning && person && (
        <BulkAssignDialog
          title={`Assign to ${person.name}`}
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
      {leaving && person && (
        <LeavingDialog
          person={person}
          direct={direct}
          ledTeams={led}
          teams={teams}
          people={data.contacts}
          onClose={() => setLeaving(false)}
        />
      )}
    </>
  );
}
