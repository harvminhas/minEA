"use client";

import { use, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { invitesApi, workspacesApi } from "@/lib/api-client";
import { primaryViewPath } from "@/lib/tenancy";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();

  const { data: preview, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => invitesApi.preview(token),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const authToken = await getToken();
      return invitesApi.accept(token, authToken!);
    },
    onSuccess: async (result) => {
      if (result.workspace_slug) {
        router.replace(primaryViewPath(result.org_slug, result.workspace_slug));
        return;
      }
      const authToken = await getToken();
      const workspaces = await workspacesApi.list(result.org_slug, authToken!);
      const ws = workspaces.find((w) => w.slug === "default") ?? workspaces[0];
      if (ws) {
        router.replace(primaryViewPath(result.org_slug, ws.slug));
      } else {
        router.replace(`/orgs/${result.org_slug}/settings`);
      }
    },
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading invite...</div>;
  }

  if (!preview) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Invite not found.</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Join {preview.org_name}</h1>
        <p className="text-sm text-gray-600 mb-4">
          You&apos;ve been invited as <strong>{preview.role}</strong> for {preview.email}.
        </p>

        {preview.consumed && <p className="text-sm text-amber-600 mb-4">This invite has already been used.</p>}
        {preview.expired && <p className="text-sm text-red-600 mb-4">This invite has expired.</p>}
        {preview.workspace_slug && (
          <p className="text-sm text-gray-500 mb-4">Workspace: {preview.workspace_slug}</p>
        )}

        {!isSignedIn ? (
          <div className="space-y-2">
            <Link
              href={`/auth/sign-in?redirect_url=/invites/${token}`}
              className="block w-full text-center bg-indigo-600 text-white rounded-md py-2.5 text-sm font-medium"
            >
              Sign in to accept
            </Link>
            <Link
              href={`/auth/sign-up?redirect_url=/invites/${token}`}
              className="block w-full text-center border border-gray-200 rounded-md py-2.5 text-sm font-medium text-gray-700"
            >
              Create account
            </Link>
          </div>
        ) : (
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={preview.consumed || preview.expired || acceptMutation.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-medium"
          >
            {acceptMutation.isPending ? "Accepting..." : "Accept invite"}
          </button>
        )}

        {acceptMutation.isError && (
          <p className="mt-3 text-xs text-red-600">{(acceptMutation.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
