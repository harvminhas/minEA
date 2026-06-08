"use client";

import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { primaryViewPath } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { ROLE_DEFINITIONS } from "@minea/types";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function OrgSettingsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const { getToken, user, resendVerificationEmail, getDevVerificationLink, reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const {
    canManageOrg,
    canCreateWorkspace,
    canManageBilling,
    canDeleteOrg,
  } = usePermissions();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const emailVerified = user?.emailVerified ?? false;

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.get(orgSlug, token!);
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.listMembers(orgSlug, token!);
    },
    enabled: canManageOrg,
  });

  const { data: invites } = useQuery({
    queryKey: ["invites", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.listInvites(orgSlug, token!);
    },
    enabled: canManageOrg,
  });

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.list(orgSlug, token!);
    },
  });

  // Non-admin members have no actions here — send them straight to their workspace
  useEffect(() => {
    if (!org || !workspaces) return;
    if (!canManageOrg && workspaces.length > 0) {
      const ws = workspaces.find((w) => w.slug === "default") ?? workspaces[0]!;
      router.replace(primaryViewPath(orgSlug, ws.slug));
    }
  }, [org, workspaces, orgSlug, router, canManageOrg]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orgsApi.createInvite(orgSlug, { email: inviteEmail, role: inviteRole }, token!);
    },
    onSuccess: (data) => {
      setInviteEmail("");
      setInviteError(null);
      setLastInviteUrl(`${window.location.origin}${data.invite_url}`);
      queryClient.invalidateQueries({ queryKey: ["invites", orgSlug] });
    },
    onError: (err: Error) => setInviteError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getToken();
      return orgsApi.revokeInvite(orgSlug, inviteId, token!);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites", orgSlug] }),
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orgsApi.deleteOrg(orgSlug, token!);
    },
    onSuccess: () => {
      queryClient.clear();
      router.replace("/home");
    },
  });

  const isDev = process.env.NODE_ENV === "development";

  async function handleResendVerification() {
    setVerifyLoading(true);
    setVerifyMessage(null);
    setVerifyLink(null);
    try {
      const result = await resendVerificationEmail();
      setVerifyMessage(result.message);
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleDevVerificationLink() {
    setVerifyLoading(true);
    setVerifyMessage(null);
    setVerifyLink(null);
    try {
      const result = await getDevVerificationLink();
      setVerifyMessage(result.message);
      if (result.verification_link) setVerifyLink(result.verification_link);
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : "Could not get dev link");
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleReloadVerification() {
    setVerifyLoading(true);
    setVerifyMessage(null);
    try {
      await reloadUser();
      setVerifyMessage("Status refreshed. If you verified, you can invite members now.");
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : "Could not refresh status");
    } finally {
      setVerifyLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{org?.name ?? orgSlug} — Settings</h1>
      {org && (
        <p className="text-sm text-gray-500 mb-6 capitalize">
          Your role: <span className="font-medium text-gray-700">{org.role}</span>
        </p>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Roles</h2>
        <div className="space-y-3 text-sm mb-2">
          <div className="flex gap-3">
            <span className="font-medium text-gray-800 w-16">{ROLE_DEFINITIONS.owner.label}</span>
            <span className="text-gray-500">{ROLE_DEFINITIONS.owner.description}</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-gray-800 w-16">{ROLE_DEFINITIONS.admin.label}</span>
            <span className="text-gray-500">{ROLE_DEFINITIONS.admin.description}</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-gray-800 w-16">{ROLE_DEFINITIONS.member.label}</span>
            <span className="text-gray-500">{ROLE_DEFINITIONS.member.description}</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-gray-800 w-16">{ROLE_DEFINITIONS.viewer.label}</span>
            <span className="text-gray-500">{ROLE_DEFINITIONS.viewer.description}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Org invites grant org access. Assign workspace roles (member or viewer) per workspace in
          workspace settings.
        </p>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Workspaces</h2>
          {canCreateWorkspace && (
            <Link
              href={`/orgs/${orgSlug}/workspaces/new`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              + New workspace
            </Link>
          )}
        </div>
        {(workspaces ?? []).length > 0 ? (
          <div className="space-y-2">
            {(workspaces ?? []).map((ws) => (
              <div
                key={ws.id}
                className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-indigo-300 text-sm"
              >
                <Link href={primaryViewPath(orgSlug, ws.slug)} className="min-w-0 flex-1">
                  <span className="font-medium">{ws.name}</span>
                  <span className="text-gray-400 ml-2">/{ws.slug}</span>
                </Link>
                {canManageOrg && (
                  <Link
                    href={`/orgs/${orgSlug}/workspaces/${ws.slug}/settings`}
                    className="text-xs text-indigo-600 hover:text-indigo-700 ml-3 flex-shrink-0"
                  >
                    Members
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No workspaces available yet. Ask an org admin to add you to a workspace.
          </p>
        )}
      </section>

      {!canManageOrg && (
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">Membership</h2>
          <p className="text-sm text-gray-600">
            You are an org member. An admin must invite you to a workspace with a member or viewer
            role before you can access repository content.
          </p>
        </section>
      )}

      {!emailVerified && (
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-amber-950 mb-2">Verify your email</h2>
          <p className="text-sm text-amber-900 mb-4">
            Your account ({user?.email}) must be verified before you can invite members or perform
            sensitive actions. Firebase sends the verification email — check inbox and spam.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={verifyLoading}
              onClick={handleResendVerification}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              {verifyLoading ? "Sending…" : "Resend verification email"}
            </button>
            {isDev && (
              <button
                type="button"
                disabled={verifyLoading}
                onClick={handleDevVerificationLink}
                className="bg-white hover:bg-amber-100 disabled:opacity-50 text-amber-950 border border-amber-300 px-4 py-2 rounded-md text-sm font-medium"
              >
                Show dev link
              </button>
            )}
            <button
              type="button"
              disabled={verifyLoading}
              onClick={handleReloadVerification}
              className="bg-white hover:bg-amber-100 disabled:opacity-50 text-amber-950 border border-amber-300 px-4 py-2 rounded-md text-sm font-medium"
            >
              I&apos;ve verified — refresh status
            </button>
          </div>
          {verifyMessage && <p className="text-sm text-amber-800 mt-3">{verifyMessage}</p>}
          {verifyLink && (
            <p className="text-sm text-amber-900 mt-3 break-all">
              Dev verification link:{" "}
              <a href={verifyLink} className="text-indigo-700 underline font-medium">
                {verifyLink}
              </a>
            </p>
          )}
        </section>
      )}

      {canManageOrg && (
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
          {!members && (
            <p className="text-sm text-gray-400 py-2">Loading members…</p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Invite to org</h3>
            {!emailVerified && (
              <p className="text-sm text-amber-700 mb-3">
                Verify your email above before inviting others.
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
                <option value="member">Member — content access via workspace invite</option>
                <option value="admin">Admin — manage workspaces and users</option>
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
            <p className="text-xs text-gray-400 mt-2">Invite-only after signup. Expires in 7 days.</p>
        </div>
      </section>
      )}

      {canManageBilling && (
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">Billing</h2>
          <p className="text-sm text-gray-500">
            Plan: <span className="font-medium text-gray-700 capitalize">{org?.plan ?? "free"}</span>
          </p>
          <p className="text-xs text-gray-400 mt-2">Billing management is owner-only. Coming soon.</p>
        </section>
      )}

      {canDeleteOrg && (
        <section className="bg-white rounded-lg border border-red-100 p-6 mb-6">
          <h2 className="font-semibold text-red-900 mb-2">Danger zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Permanently delete this organization, all workspaces, and all repository data.
          </p>
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="border border-red-300 text-red-700 hover:bg-red-50 px-4 py-2 rounded-md text-sm font-medium"
            >
              Delete organization
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-gray-200 px-4 py-2 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteOrgMutation.mutate()}
                disabled={deleteOrgMutation.isPending}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {deleteOrgMutation.isPending ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          )}
        </section>
      )}

      {canManageOrg && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Pending invites</h2>
          <div className="divide-y divide-gray-100">
            {(invites ?? []).filter((i) => i.status === "pending").map((inv) => (
              <div key={inv.id} className="py-2 flex justify-between items-center text-sm">
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-gray-400 capitalize">{inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
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
      )}
    </div>
  );
}
