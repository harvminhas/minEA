"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AccountabilitiesPanel, type AssignTarget } from "@/components/people/AccountabilitiesPanel";
import { AssignAccountabilityDialog } from "@/components/people/AssignAccountabilityDialog";
import { EditAccountabilityDialog } from "@/components/people/EditAccountabilityDialog";
import { ConfirmRemoveAssignmentDialog } from "@/components/people/ConfirmRemoveAssignmentDialog";
import { ASSIGNMENT_KIND_STYLE, PEOPLE_LAYER_COLOR, initials } from "@/lib/people-utils";
import { cn } from "@/lib/utils";
import type { AssignmentKind, PeopleAccountability, PeopleRole } from "@minea/types";

const ROLES_PREVIEW_COUNT = 2;

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

  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [description, setDescription] = useState("");
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
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

  useEffect(() => {
    if (!team) return;
    setLeadName(team.lead_name ?? "");
    setLeadEmail(team.lead_email ?? "");
    setDescription(team.description ?? "");
  }, [team]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.updateTeam(orgSlug, workspaceSlug, teamId, {
        description: description || null,
        lead_name: leadName || null,
        lead_email: leadEmail || null,
      }, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people-team", orgSlug, workspaceSlug, teamId] });
      queryClient.invalidateQueries({ queryKey: ["people-teams", orgSlug, workspaceSlug] });
      onUpdate();
      onClose();
    },
  });

  const refreshAccountabilities = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["people-team", orgSlug, workspaceSlug, teamId],
    });
  };

  const handleDeleteAssignment = (item: PeopleAccountability) => {
    setDeleteError(null);
    setDeleteTarget(item);
  };

  const confirmDeleteAssignment = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await peopleApi.deleteAccountability(orgSlug, workspaceSlug, deleteTarget.id, token);
      setDeleteTarget(null);
      await refreshAccountabilities();
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
      queryClient.invalidateQueries({ queryKey: ["people-team", orgSlug, workspaceSlug, teamId] });
      onUpdate();
    },
  });

  const availableRoles =
    allRoles?.items.filter(
      (role) => !team?.roles.some((r) => r.people_role_id === role.id)
    ) ?? [];

  const visibleRoles = team
    ? showAllRoles
      ? team.roles
      : team.roles.slice(0, ROLES_PREVIEW_COUNT)
    : [];
  const hiddenCount = team ? Math.max(0, team.roles.length - ROLES_PREVIEW_COUNT) : 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Full overlay (sidebar-aware) */}
      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col overflow-hidden">

        {/* Top bar: breadcrumb + close */}
        <div className="flex items-center justify-between px-8 pt-6 pb-2 bg-[#faf8f5]">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              People · Teams
            </p>
            <h1 className="text-xl font-semibold text-gray-900">
              {isLoading ? "Loading…" : team?.name ?? "Team"}
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 text-gray-400 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-200/80 mx-8 mt-3" />

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">

          {/* ─── Left panel ──────────────────────────────────── */}
          <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

            {isLoading || !team ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400">Loading team…</p>
              </div>
            ) : (
              <>
                {/* Team header */}
                <div className="px-6 pt-6 pb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: "#f97316" }}
                    >
                      {initials(team.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{team.name}</p>
                      <p className="text-xs text-gray-400">
                        {team.roles.length} role{team.roles.length === 1 ? "" : "s"}
                        {team.lead_name ? ` · Lead: ${team.lead_name}` : ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form fields */}
                <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">

                  {/* Team Lead — single combined field */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Team Lead
                    </label>
                    <div className="rounded-md border border-gray-200 overflow-hidden">
                      <input
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        placeholder="Name"
                        className="w-full px-3 py-2.5 text-sm text-gray-800 border-b border-gray-100 focus:outline-none focus:bg-gray-50"
                      />
                      <input
                        value={leadEmail}
                        onChange={(e) => setLeadEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full px-3 py-2.5 text-sm text-gray-500 focus:outline-none focus:bg-gray-50"
                      />
                    </div>
                    {(leadName || leadEmail) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {[leadName, leadEmail].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                      placeholder="What this team owns…"
                    />
                  </div>

                  {/* Roles */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Roles · {team.roles.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddRole((v) => !v)}
                        className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        + Add
                      </button>
                    </div>

                    {/* Add role form */}
                    {showAddRole && (
                      <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                        <select
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value)}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none"
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
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none"
                        />
                        <input
                          value={assigneeEmail}
                          onChange={(e) => setAssigneeEmail(e.target.value)}
                          placeholder="Assignee email"
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none"
                        />
                        <select
                          value={assignmentKind}
                          onChange={(e) => setAssignmentKind(e.target.value as AssignmentKind)}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm capitalize focus:outline-none"
                        >
                          <option value="owner">Owner</option>
                          <option value="performer">Performer</option>
                        </select>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => addRoleMutation.mutate()}
                            disabled={!selectedRoleId || addRoleMutation.isPending}
                            className="flex-1 bg-gray-900 text-white rounded-md py-1.5 text-xs font-medium disabled:opacity-50 transition-colors"
                          >
                            {addRoleMutation.isPending ? "Adding…" : "Add role"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowAddRole(false)}
                            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {team.roles.length === 0 ? (
                      <p className="text-sm text-gray-400">No roles on this team yet</p>
                    ) : (
                      <>
                        <ul className="space-y-2">
                          {visibleRoles.map((role) => (
                            <li
                              key={role.id}
                              className="flex items-center gap-3 rounded-lg border border-gray-200/80 bg-[#faf8f5] px-3 py-2.5"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {role.role_name}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5 truncate">
                                  {role.assignee_name ?? "Unassigned"}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize flex-shrink-0",
                                  ASSIGNMENT_KIND_STYLE[role.assignment_kind] ??
                                    "bg-gray-100 text-gray-600"
                                )}
                              >
                                {role.assignment_kind.charAt(0).toUpperCase() +
                                  role.assignment_kind.slice(1)}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {hiddenCount > 0 && !showAllRoles && (
                          <button
                            type="button"
                            onClick={() => setShowAllRoles(true)}
                            className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            + {hiddenCount} more role{hiddenCount === 1 ? "" : "s"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Save */}
                <div className="px-6 py-5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-md py-3 text-sm font-semibold transition-colors"
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ─── Right panel: accountabilities ─────────────────── */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {team && (
              <AccountabilitiesPanel
                accountabilities={team.accountabilities}
                subjectLabel="team"
                includeDomains
                onAssign={setAssignTarget}
                onEdit={setEditTarget}
                onDelete={handleDeleteAssignment}
                deletingId={deletingId}
              />
            )}
          </div>
        </div>
      </div>

      {assignTarget && team && (
        <AssignAccountabilityDialog
          subjectType="team"
          subjectId={teamId}
          entityKind={assignTarget.entityKind}
          sectionTitle={assignTarget.sectionTitle}
          existingPairs={team.accountabilities
            .filter((a) => a.entity_kind === assignTarget.entityKind)
            .map((a) => ({ entityId: a.entity_id, linkKind: a.link_kind }))}
          onClose={() => setAssignTarget(null)}
          onSuccess={async () => {
            setAssignTarget(null);
            await refreshAccountabilities();
          }}
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
            await refreshAccountabilities();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmRemoveAssignmentDialog
          entityName={deleteTarget.entity_name}
          linkKind={deleteTarget.link_kind}
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
