"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLE_DEFINITIONS } from "@minea/types";
import { workspacesApi } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import { primaryViewPath } from "@/lib/tenancy";

export default function WorkspaceSettingsPage() {
  const { orgSlug, workspaceSlug } = useParams<{ orgSlug: string; workspaceSlug: string }>();
  const { getToken, user } = useAuth();
  const queryClient = useQueryClient();
  const { canManageWorkspace, canInviteWorkspaceMembers, effectiveRole } = usePermissions();
  const emailVerified = user?.emailVerified ?? false;

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
    onError: (err: Error) => setInviteError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getToken();
      return workspacesApi.revokeInvite(orgSlug, workspaceSlug, inviteId, token!);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspace-invites", orgSlug, workspaceSlug] }),
  });

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
        <h2 className="font-semibold text-gray-900 mb-4">Members</h2>
        <div className="divide-y divide-gray-100 mb-4">
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="py-2 flex justify-between text-sm">
              <div>
                <p className="font-medium">{m.full_name ?? m.email}</p>
                <p className="text-gray-400">{m.email}</p>
              </div>
              <span className="text-gray-500 capitalize">{m.role}</span>
            </div>
          ))}
          {!members && <p className="text-sm text-gray-400 py-2">Loading members…</p>}
        </div>

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
              <div key={inv.id} className="py-2 flex justify-between items-center text-sm">
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-gray-400 capitalize">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => revokeMutation.mutate(inv.id)}
                  disabled={revokeMutation.isPending}
                  className="text-red-600 hover:text-red-800 text-xs"
                >
                  Revoke
                </button>
              </div>
            ))}
          {(invites ?? []).filter((i) => i.status === "pending").length === 0 && (
            <p className="text-sm text-gray-400 py-2">No pending invites</p>
          )}
        </div>
      </section>
    </div>
  );
}
