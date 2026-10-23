"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AccountabilityRow } from "@/components/people/AccountabilitiesPanel";
import { EditAccountabilityDialog } from "@/components/people/EditAccountabilityDialog";
import { ConfirmRemoveAssignmentDialog } from "@/components/people/ConfirmRemoveAssignmentDialog";
import { LeadPicker } from "@/components/people/LeadPicker";
import {
  BulkAssignDialog,
  ownerOptions,
  useOwnershipData,
  useOwnershipWrite,
} from "@/components/mvp/OwnersPage";
import { ROLE_CHIP, groupByType, membersOf, roleLabel, teamOwnedRows } from "@/lib/ownership";
import { ASSIGNMENT_KIND_STYLE, accountabilityDisplayKind } from "@/lib/people-utils";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  AssignmentKind,
  OwnerRef,
  OwnershipBulkRequest,
  PeopleAccountability,
  PeopleRole,
  TeamUpdate,
} from "@minea/types";

const selectClass =
  "rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#1c2230]";
const sectionLabel = "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]";

interface Props {
  teamId: string;
  onClose: () => void;
  onUpdate: () => void;
}

/** Click to edit; Enter or leaving the field saves, Escape cancels. */
function InlineText({
  value,
  placeholder,
  multiline,
  label,
  onSave,
  className,
}: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  label: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };
  if (editing) {
    const common = {
      "aria-label": label,
      autoFocus: true,
      value: draft,
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        } else if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
          e.preventDefault();
          commit();
        }
      },
      className: cn(
        "w-full rounded-md border border-[#c9c3f7] bg-white px-2 py-1 outline-none",
        className,
      ),
    };
    return multiline ? (
      <textarea
        {...common}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
      />
    ) : (
      <input {...common} onChange={(e) => setDraft(e.target.value)} />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Edit ${label.toLowerCase()}`}
      onClick={() => setEditing(true)}
      className={cn("group inline-flex items-center gap-1.5 text-left", className)}
    >
      <span className={value ? "" : "text-[#8b90a0]"}>{value || placeholder}</span>
      <Pencil size={12} className="shrink-0 text-[#b4b8c4] group-hover:text-[#5b4ce6]" />
    </button>
  );
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
  const [showAddRole, setShowAddRole] = useState(false);
  const [editTarget, setEditTarget] = useState<PeopleAccountability | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PeopleAccountability | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [assignmentKind, setAssignmentKind] = useState<AssignmentKind>("performer");

  const { data: team, isLoading } = useQuery({
    queryKey: ["people-team", orgSlug, workspaceSlug, teamId],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.getTeam(orgSlug, workspaceSlug, teamId, token!);
    },
    enabled,
  });

  const addRoleEnabled = useAuthQueryEnabled(showAddRole);
  const { data: allRoles } = useQuery({
    queryKey: ["people-roles", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listRoles(orgSlug, workspaceSlug, token!);
    },
    enabled: addRoleEnabled,
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

  const confirmDeleteAssignment = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await peopleApi.deleteAccountability(orgSlug, workspaceSlug, deleteTarget.id, token);
      setDeleteTarget(null);
      await refreshTeam();
    } catch {
      setDeleteError("Could not remove assignment. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const addRoleMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.addTeamRole(orgSlug, workspaceSlug, teamId, {
        people_role_id: selectedRoleId,
        assignee_name: assigneeName || undefined,
        assignee_email: assigneeEmail || undefined,
        assignment_kind: assignmentKind,
      }, token!);
    },
    onSuccess: () => {
      setShowAddRole(false);
      setSelectedRoleId("");
      setAssigneeName("");
      setAssigneeEmail("");
      refreshTeam();
      onUpdate();
    },
  });

  const owner: OwnerRef = { type: "team", id: teamId };
  const owned = teamOwnedRows(data.items, teamId);
  const groups = groupByType(owned, (r) => r.item.type, (r) => r.item.name);
  const members = membersOf(data.contacts, teamId);
  const targets = ownerOptions(data.teams, data.contacts).filter(
    (o) => o.value !== `team:${teamId}`,
  );
  const others = team?.accountabilities ?? [];
  const availableRoles =
    allRoles?.items.filter((role) => !team?.roles.some((r) => r.people_role_id === role.id)) ?? [];

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
                  <LeadPicker
                    contacts={data.contacts}
                    value={team.lead_contact_id}
                    legacyName={team.lead_name}
                    disabled={saveMutation.isPending}
                    onChange={(id) => saveMutation.mutate({ lead_contact_id: id })}
                  />
                </span>
                <span>
                  <span className="text-[#8b90a0]">Members</span> {members}
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

              <div className="mb-3 mt-6 flex items-center justify-between">
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

              <details className="mt-6 border-t border-[#e6e8ee] pt-3 text-[13px]">
                <summary className="cursor-pointer font-semibold">
                  Other accountabilities · {others.length}
                </summary>
                {others.length === 0 ? (
                  <p className="mt-2 text-[#8b90a0]">None.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {others.map((a) => (
                      <AccountabilityRow
                        key={a.id}
                        item={a}
                        onEdit={setEditTarget}
                        onDelete={(item) => {
                          setDeleteError(null);
                          setDeleteTarget(item);
                        }}
                        isDeleting={deletingId === a.id}
                      />
                    ))}
                  </div>
                )}
              </details>

              <details className="mt-3 border-t border-[#e6e8ee] pt-3 text-[13px]">
                <summary className="cursor-pointer font-semibold">Team roles · {team.roles.length}</summary>
                <ul className="mt-2 space-y-1.5">
                  {team.roles.map((role) => (
                    <li
                      key={role.id}
                      className="flex items-center gap-3 rounded-lg border border-[#e6e8ee] px-3 py-2"
                    >
                      <span className="flex-1">
                        <span className="font-medium">{role.role_name}</span>
                        <span className="text-[#8b90a0]"> · {role.assignee_name ?? "Unassigned"}</span>
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize",
                          ASSIGNMENT_KIND_STYLE[role.assignment_kind] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {role.assignment_kind}
                      </span>
                    </li>
                  ))}
                </ul>
                {showAddRole ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Role"
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Select role…</option>
                      {availableRoles.map((role: PeopleRole) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={assigneeName}
                      onChange={(e) => setAssigneeName(e.target.value)}
                      placeholder="Assignee name"
                      className={selectClass}
                    />
                    <input
                      value={assigneeEmail}
                      onChange={(e) => setAssigneeEmail(e.target.value)}
                      placeholder="Assignee email"
                      className={selectClass}
                    />
                    <select
                      aria-label="Kind"
                      value={assignmentKind}
                      onChange={(e) => setAssignmentKind(e.target.value as AssignmentKind)}
                      className={selectClass}
                    >
                      <option value="owner">Owner</option>
                      <option value="performer">Performer</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => addRoleMutation.mutate()}
                      disabled={!selectedRoleId || addRoleMutation.isPending}
                      className="rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button type="button" onClick={() => setShowAddRole(false)} className="text-[#8b90a0]">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddRole(true)}
                    className="mt-2 text-[12px] text-[#5b4ce6]"
                  >
                    + Add role
                  </button>
                )}
              </details>
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

      {editTarget && team && (
        <EditAccountabilityDialog
          item={editTarget}
          subjectType="team"
          existingPairs={team.accountabilities
            .filter((a) => a.entity_kind === editTarget.entity_kind)
            .map((a) => ({ entityId: a.entity_id, linkKind: a.link_kind }))}
          onClose={() => setEditTarget(null)}
          onSuccess={async () => {
            setEditTarget(null);
            await refreshTeam();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmRemoveAssignmentDialog
          entityName={deleteTarget.entity_name}
          linkKind={accountabilityDisplayKind(deleteTarget)}
          subjectType="team"
          loading={deletingId === deleteTarget.id}
          error={deleteError}
          onConfirm={confirmDeleteAssignment}
          onClose={() => {
            if (deletingId) return;
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}
