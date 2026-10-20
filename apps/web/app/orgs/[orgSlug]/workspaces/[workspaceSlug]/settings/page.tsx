"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLE_DEFINITIONS } from "@minea/types";
import { workspacesApi } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import { hasPermission } from "@/lib/permissions";
import { primaryViewPath } from "@/lib/tenancy";
import { billingUiEnabled } from "@/lib/billing/flags";
import { billingErrorMessage } from "@/lib/billing/checkout";
import { PEOPLE_QUERY, usePeoplePanel } from "@/components/org/PeoplePanel";
import { MembersTable, type MembersScope } from "@/components/org/OrgMembersTable";
import { countAdmins, workspaceMemberActions, WS_REMOVE_COPY } from "@/lib/member-actions";

export default function WorkspaceSettingsPage() {
  const { orgSlug, workspaceSlug } = useParams<{ orgSlug: string; workspaceSlug: string }>();
  const { getToken, user } = useAuth();
  const queryClient = useQueryClient();
  const { canManageWorkspace, canInviteWorkspaceMembers, effectiveRole, orgRole } = usePermissions();
  // workspace.delete: org owners/admins, and admins of this workspace (same rule as the API).
  const canDeleteWorkspace = hasPermission("workspace.delete", { orgRole, workspaceRole: effectiveRole });
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [generalMsg, setGeneralMsg] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const emailVerified = user ? !user.requiresEmailVerification : false;
  const router = useRouter();
  const [memberError, setMemberError] = useState<string | null>(null);

  const { data: workspace } = useQuery({
    queryKey: ["workspace", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.get(orgSlug, workspaceSlug, token!);
    },
  });

  const { data: members } = useQuery({
    queryKey: ["workspace-members", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.listMembers(orgSlug, workspaceSlug, token!);
    },
    enabled: canManageWorkspace,
  });

  const refreshPeople = () => {
    // Licence counts are computed from memberships; the Licences roster reads these same queries.
    void queryClient.invalidateQueries({ queryKey: ["workspace-members", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: [PEOPLE_QUERY, orgSlug] });
    void queryClient.invalidateQueries({ queryKey: ["billing-status", orgSlug] });
  };
  const memberMutation = useMutation({
    mutationFn: async (
      action: { kind: "role"; userId: string; role: string } | { kind: "remove"; userId: string } | { kind: "leave" }
    ) => {
      const token = await getToken();
      if (action.kind === "role")
        return void (await workspacesApi.changeMemberRole(orgSlug, workspaceSlug, action.userId, action.role, token!));
      if (action.kind === "remove") return workspacesApi.removeMember(orgSlug, workspaceSlug, action.userId, token!);
      return workspacesApi.leave(orgSlug, workspaceSlug, token!);
    },
    onSuccess: (_d, action) => {
      setMemberError(null);
      if (action.kind === "role" || action.kind === "remove") {
        // Show the change at once; the refetch below confirms it.
        queryClient.setQueryData(["workspace-members", orgSlug, workspaceSlug], (old: { user_id: string; role: string }[] | undefined) =>
          action.kind === "role"
            ? old?.map((m) => (m.user_id === action.userId ? { ...m, role: action.role } : m))
            : old?.filter((m) => m.user_id !== action.userId)
        );
      }
      if (action.kind === "leave") {
        void queryClient.invalidateQueries({ queryKey: ["workspaces", orgSlug] });
        router.replace(`/orgs/${orgSlug}`);
        return;
      }
      refreshPeople();
    },
    onError: (err: Error, action) => {
      if (action.kind === "leave") setMemberError(err.message);
    },
  });
  const people = usePeoplePanel({
    orgSlug,
    workspaceSlug,
    enabled: canManageWorkspace && canInviteWorkspaceMembers,
    emailVerified,
    errorMessage: (err) => (billingUiEnabled() ? billingErrorMessage(err) : err.message),
    onChanged: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-members", orgSlug, workspaceSlug] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status", orgSlug] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getToken();
      return workspacesApi.update(orgSlug, workspaceSlug, { name }, token!);
    },
    onSuccess: (ws) => {
      setNameDraft(null);
      setGeneralMsg("Saved");
      queryClient.setQueryData(["workspace", orgSlug, workspaceSlug], ws);
      void queryClient.invalidateQueries({ queryKey: ["workspaces", orgSlug] });
    },
    onError: (err: Error) => setGeneralMsg(billingErrorMessage(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return workspacesApi.delete(orgSlug, workspaceSlug, token!);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces", orgSlug] });
      router.replace(`/orgs/${orgSlug}`);
    },
    onError: (err: Error) => setDeleteError(billingErrorMessage(err)),
  });

  const admins = countAdmins(members);
  const scope: MembersScope = {
    actionsFor: (m, isSelf) =>
      workspaceMemberActions({ canManage: canManageWorkspace, isSelf, targetRole: m.role, adminCount: admins }),
    removeLabel: "Remove",
    removeTitle: (name) => `Remove ${name} from this workspace?`,
    removeCopy: WS_REMOVE_COPY,
    leaveLabel: "Leave workspace",
    leaveTitle: "Leave this workspace?",
    leaveCopy: "You lose access to this workspace but stay in the org. Everything you created stays.",
  };

  if (!canManageWorkspace) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Workspace settings</h1>
        <p className="text-sm text-gray-600 mb-4">
          You need workspace admin access to manage this workspace.
        </p>
        <Link
          href={primaryViewPath(orgSlug, workspaceSlug)}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          ← Back to workspace
        </Link>
        <div className="mt-6 border-t border-gray-100 pt-4">
          <button
            type="button"
            data-testid="ws-leave-standalone"
            onClick={() => {
              if (window.confirm("Leave this workspace? You stay in the org and everything you created stays.")) {
                memberMutation.mutate({ kind: "leave" });
              }
            }}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Leave workspace
          </button>
          {memberError && <p className="text-sm text-red-600 mt-2">{memberError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={primaryViewPath(orgSlug, workspaceSlug)}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          ← Back to workspace
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">
          {workspace?.name ?? workspaceSlug} — Settings
        </h1>
        {effectiveRole && (
          <p className="text-sm text-gray-500 mt-1 capitalize">
            Your workspace role: <span className="font-medium text-gray-700">{effectiveRole}</span>
          </p>
        )}
      </div>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6" data-testid="ws-general">
        <h2 className="font-semibold text-gray-900 mb-3">General</h2>
        <label className="block text-sm text-gray-700 mb-1" htmlFor="ws-name">Workspace name</label>
        <div className="flex gap-2">
          <input
            id="ws-name"
            value={nameDraft ?? workspace?.name ?? ""}
            onChange={(e) => {
              setNameDraft(e.target.value);
              setGeneralMsg(null);
            }}
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="button"
            data-testid="ws-rename-save"
            disabled={!nameDraft?.trim() || nameDraft.trim() === workspace?.name || renameMutation.isPending}
            onClick={() => nameDraft && renameMutation.mutate(nameDraft.trim())}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {renameMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        {generalMsg && <p className={`text-xs mt-2 ${generalMsg === "Saved" ? "text-emerald-600" : "text-red-600"}`}>{generalMsg === "Saved" ? "✓ Saved" : generalMsg}</p>}
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Workspace roles</h2>
        <div className="space-y-3 text-sm">
          {(["admin", "member", "viewer"] as const).map((role) => (
            <div key={role} className="flex gap-3">
              <span className="font-medium text-gray-800 w-16 capitalize">{ROLE_DEFINITIONS[role].label}</span>
              <span className="text-gray-500">{ROLE_DEFINITIONS[role].description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <MembersTable
          members={members}
          actorEmail={user?.email}
          busy={memberMutation.isPending && memberMutation.variables?.kind === "leave"}
          error={memberError}
          scope={scope}
          onChangeRole={(userId, role) => memberMutation.mutateAsync({ kind: "role", userId, role })}
          onRemove={(userId) => memberMutation.mutateAsync({ kind: "remove", userId })}
          onLeave={() => memberMutation.mutate({ kind: "leave" })}
          extra={people.extra}
          after={people.after}
          headerAction={people.headerAction}
        />
        {!emailVerified && (
          <p className="text-sm text-amber-700 mt-2">Verify your email in org settings before inviting others.</p>
        )}
        {people.dialog}

      </section>

      {canDeleteWorkspace && (
        <section className="bg-white rounded-lg border border-red-100 p-6 mt-6" data-testid="ws-danger-zone">
          <h2 className="font-semibold text-red-900 mb-2">Danger zone</h2>
          <p className="text-sm text-gray-600 mb-3">
            Deleting {workspace?.name ?? "this workspace"} removes it and everything in it for everyone. This can&apos;t be undone.
            Type the workspace name to confirm.
          </p>
          <div className="flex gap-2">
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={workspace?.name ?? ""}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="button"
              data-testid="ws-delete"
              disabled={!workspace || deleteConfirm !== workspace.name || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete workspace"}
            </button>
          </div>
          {deleteError && <p className="text-sm text-red-600 mt-2">{deleteError}</p>}
        </section>
      )}
    </div>
  );
}
