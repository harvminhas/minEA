"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AccountabilitiesPanel } from "@/components/people/AccountabilitiesPanel";
import { AssignAccountabilityDialog } from "@/components/people/AssignAccountabilityDialog";
import { PEOPLE_LAYER_COLOR, initials } from "@/lib/people-utils";
import type { PeopleRoleKind } from "@minea/types";

interface AssignTarget {
  sectionKey: string;
  entityKind: string;
  linkKind: string;
  sectionTitle: string;
}

const ROLE_KINDS: PeopleRoleKind[] = ["owner", "performer", "steward"];

// Stable colors for team dots
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
  const [roleKind, setRoleKind] = useState<PeopleRoleKind>("owner");
  const [description, setDescription] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

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
    setRoleKind(role.role_kind as PeopleRoleKind);
    setDescription(role.description ?? "");
  }, [role]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.updateRole(orgSlug, workspaceSlug, roleId, {
        name,
        role_kind: roleKind,
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

        {/* Divider */}
        <div className="h-px bg-gray-200/80 mx-8 mt-3" />

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">

          {/* ─── Left panel: edit form ─────────────────────────── */}
          <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

            {isLoading || !role ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400">Loading role…</p>
              </div>
            ) : (
              <>
                {/* Role header */}
                <div className="px-6 pt-6 pb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: PEOPLE_LAYER_COLOR }}
                    >
                      {initials(role.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{role.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{roleKind} type</p>
                    </div>
                  </div>
                </div>

                {/* Form fields */}
                <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Type
                    </label>
                    <div className="relative">
                      <select
                        value={roleKind}
                        onChange={(e) => setRoleKind(e.target.value as PeopleRoleKind)}
                        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 capitalize pr-8"
                      >
                        {ROLE_KINDS.map((kind) => (
                          <option key={kind} value={kind} className="capitalize">
                            {kind.charAt(0).toUpperCase() + kind.slice(1)}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        ▾
                      </span>
                    </div>
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

                  {/* Teams using this role */}
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

                {/* Save */}
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

          {/* ─── Right panel: accountabilities ────────────────── */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {role && (
              <AccountabilitiesPanel
                accountabilities={role.accountabilities}
                subjectLabel="role"
                onAssign={setAssignTarget}
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
          linkKind={assignTarget.linkKind}
          sectionTitle={assignTarget.sectionTitle}
          existingEntityIds={role.accountabilities
            .filter(
              (a) =>
                a.entity_kind === assignTarget.entityKind &&
                a.link_kind === assignTarget.linkKind
            )
            .map((a) => a.entity_id)}
          onClose={() => setAssignTarget(null)}
          onSuccess={() => {
            setAssignTarget(null);
            queryClient.invalidateQueries({ queryKey: ["people-role", orgSlug, workspaceSlug, roleId] });
          }}
        />
      )}
    </>
  );
}
