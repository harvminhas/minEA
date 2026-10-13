"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLE_DEFINITIONS } from "@minea/types";
import { workspacesApi } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import { primaryViewPath } from "@/lib/tenancy";
import { billingUiEnabled } from "@/lib/billing/flags";
import { billingErrorMessage } from "@/lib/billing/checkout";
import { PendingInviteRow } from "@/components/org/PendingInviteRow";
import { MembersTable, type MembersScope } from "@/components/org/OrgMembersTable";
import { countAdmins, workspaceMemberActions, WS_REMOVE_COPY } from "@/lib/member-actions";

export default function WorkspaceSettingsPage() {
  const { orgSlug, workspaceSlug } = useParams<{ orgSlug: string; workspaceSlug: string }>();
  const { getToken, user } = useAuth();
  const queryClient = useQueryClient();
  const { canManageWorkspace, canInviteWorkspaceMembers, effectiveRole } = usePermissions();
  const emailVerified = user ? !user.requiresEmailVerification : false;
  const router = useRouter();
  const [memberError, setMemberError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

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

  const { data: invites } = useQuery({
    queryKey: ["workspace-invites", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.listInvites(orgSlug, workspaceSlug, token!);
    },
    enabled: canInviteWorkspaceMembers,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return workspacesApi.createInvite(
        orgSlug,
        workspaceSlug,
        { email: inviteEmail, role: inviteRole },
        token!
      );
    },
    onSuccess: (data) => {
      setInviteEmail("");
      setInviteError(null);
      setLastInviteUrl(`${window.location.origin}${data.invite_url}`);
      queryClient.invalidateQueries({ queryKey: ["workspace-invites", orgSlug, workspaceSlug] });
    },
    // Flag on: show the API's message (e.g. licence limit) instead of raw JSON.
    onError: (err: Error) => setInviteError(billingUiEnabled() ? billingErrorMessage(err) : err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getToken();
      return workspacesApi.revokeInvite(orgSlug, workspaceSlug, inviteId, token!);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspace-invites", orgSlug, workspaceSlug] }),
  });

  const refreshPeople = () => {
    // Licence counts are computed from memberships; the Licences roster reads these same queries.
    void queryClient.invalidateQueries({ queryKey: ["workspace-members", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-invites", orgSlug, workspaceSlug] });
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
  const resendMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getToken();
      return workspacesApi.resendInvite(orgSlug, workspaceSlug, inviteId, token!);
    },
    onSuccess: () => refreshPeople(),
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
        />

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Invite to workspace</h3>
          {!emailVerified && (
            <p className="text-sm text-amber-700 mb-3">
              Verify your email in org settings before inviting others.
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@company.com"
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="border border-gray-200 rounded-md px-2 py-2 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteEmail || !emailVerified || inviteMutation.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
            >
              Invite
            </button>
          </div>
          {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
          {lastInviteUrl && (
            <p className="text-xs text-gray-600 mt-2 break-all">
              Invite link:{" "}
              <a href={lastInviteUrl} className="text-indigo-600 underline">
                {lastInviteUrl}
              </a>
            </p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Pending invites</h2>
        <div className="divide-y divide-gray-100">
          {(invites ?? [])
            .filter((i) => i.status === "pending")
            .map((inv) => (
              <PendingInviteRow
                key={inv.id}
                invite={inv}
                onResend={async (id) => `${window.location.origin}${(await resendMutation.mutateAsync(id)).invite_url}`}
                onRevoke={(id) => revokeMutation.mutateAsync(id)}
              />
            ))}
          {(invites ?? []).filter((i) => i.status === "pending").length === 0 && (
            <p className="text-sm text-gray-400 py-2">No pending invites</p>
          )}
        </div>
      </section>
    </div>
  );
}
