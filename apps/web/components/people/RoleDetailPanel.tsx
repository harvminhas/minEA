"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  AccountabilitiesPanel,
  type AssignTarget,
} from "@/components/people/AccountabilitiesPanel";
import { AssignAccountabilityDialog } from "@/components/people/AssignAccountabilityDialog";
import { EditAccountabilityDialog } from "@/components/people/EditAccountabilityDialog";
import { ConfirmRemoveAssignmentDialog } from "@/components/people/ConfirmRemoveAssignmentDialog";
import { PEOPLE_LAYER_COLOR, initials } from "@/lib/people-utils";
import type { PeopleAccountability } from "@minea/types";

const TEAM_DOT_COLORS = ["#e11d48", "#f59e0b", "#6366f1", "#0ea5e9", "#22c55e", "#8b5cf6"];

interface Props {
  roleId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function RoleDetailPanel({ roleId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(roleId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [editTarget, setEditTarget] = useState<PeopleAccountability | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PeopleAccountability | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: role, isLoading } = useQuery({
    queryKey: ["people-role", orgSlug, workspaceSlug, roleId],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.getRole(orgSlug, workspaceSlug, roleId, token!);
    },
    enabled,
  });

  useEffect(() => {
    if (!role) return;
    setName(role.name);
    setDescription(role.description ?? "");
  }, [role]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.updateRole(orgSlug, workspaceSlug, roleId, {
        name: name.trim(),
        description: description || null,
      }, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people-role", orgSlug, workspaceSlug, roleId] });
      queryClient.invalidateQueries({ queryKey: ["people-roles", orgSlug, workspaceSlug] });
      onUpdate();
      onClose();
    },
  });

  const refreshAccountabilities = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["people-role", orgSlug, workspaceSlug, roleId],
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

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-6 pb-2 bg-[#faf8f5]">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              People · Roles
            </p>
            <h1 className="text-xl font-semibold text-gray-900">
              {isLoading ? "Loading…" : role?.name ?? "Role"}
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

        <div className="h-px bg-gray-200/80 mx-8 mt-3" />

        <div className="flex flex-1 min-h-0">
          <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            {isLoading || !role ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400">Loading role…</p>
              </div>
            ) : (
              <>
                <div className="px-6 pt-6 pb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: PEOPLE_LAYER_COLOR }}
                    >
                      {initials(name || role.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{name || role.name}</p>
                      <p className="text-xs text-gray-400">
                        {role.accountabilities.length} assignment{role.accountabilities.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                      placeholder="What this role is responsible for…"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Teams Using This Role
                    </label>

                    {role.teams.length === 0 ? (
                      <p className="text-sm text-gray-400">Not assigned to any team yet</p>
                    ) : (
                      <ul className="space-y-0">
                        {role.teams.map((team, i) => (
                          <li
                            key={team.team_id}
                            className="flex items-center gap-2.5 py-2.5 border-b border-gray-100 last:border-b-0"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: TEAM_DOT_COLORS[i % TEAM_DOT_COLORS.length] }}
                            />
                            <span className="text-sm text-gray-800 flex-1 min-w-0 truncate font-medium">
                              {team.team_name}
                            </span>
                            <span className="text-sm text-gray-400 flex-shrink-0">
                              {team.assignee_name ?? "Unassigned"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      type="button"
                      className="mt-3 w-full rounded-md border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      + Add to another team
                    </button>
                  </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !name.trim()}
                    className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-md py-3 text-sm font-semibold transition-colors"
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto">
            {role && (
              <AccountabilitiesPanel
                accountabilities={role.accountabilities}
                subjectLabel="role"
                onAssign={setAssignTarget}
                onEdit={setEditTarget}
                onDelete={handleDeleteAssignment}
                deletingId={deletingId}
              />
            )}
          </div>
        </div>
      </div>

      {assignTarget && role && (
        <AssignAccountabilityDialog
          subjectType="role"
          subjectId={roleId}
          entityKind={assignTarget.entityKind}
          sectionTitle={assignTarget.sectionTitle}
          existingPairs={role.accountabilities
            .filter((a) => a.entity_kind === assignTarget.entityKind)
            .map((a) => ({ entityId: a.entity_id, linkKind: a.link_kind }))}
          onClose={() => setAssignTarget(null)}
          onSuccess={async () => {
            setAssignTarget(null);
            await refreshAccountabilities();
          }}
        />
      )}

      {editTarget && role && (
        <EditAccountabilityDialog
          item={editTarget}
          subjectType="role"
          existingPairs={role.accountabilities
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
          subjectType="role"
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
