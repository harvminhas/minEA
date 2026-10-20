"use client";

import { use, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { invitesApi, workspacesApi } from "@/lib/api-client";
import { primaryViewPath } from "@/lib/tenancy";
import { orgLandingPath } from "@/lib/org-access";
import { friendlyError } from "@/lib/row-saving";
import { InviteCard } from "@/components/org/InviteCard";
import { passwordSignInEnabled } from "@/lib/auth/flags";
import { SocialSignIn } from "@/components/auth/SocialSignIn";
import { PasswordUsersNote } from "@/components/auth/ProviderButtons";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { getToken, isSignedIn, refreshSession, user } = useAuth();
  const showPassword = passwordSignInEnabled();
  const router = useRouter();

  const { data: preview, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => invitesApi.preview(token),
  });

  const [already, setAlready] = useState<{ href: string; label: string } | null>(null);
  const acceptMutation = useMutation({
    mutationFn: async () => {
      const authToken = await getToken();
      return invitesApi.accept(token, authToken!);
    },
    onSuccess: async (result) => {
      // The server picks the first chosen workspace you can open; with none, say so (not Org settings).
      let dest = result.workspace_slug ? primaryViewPath(result.org_slug, result.workspace_slug) : null;
      if (!dest) {
        const authToken = await getToken();
        const workspaces = await workspacesApi.list(result.org_slug, authToken!).catch(() => []);
        dest = orgLandingPath(result.org_slug, workspaces);
      }
      if (result.already) {
        setAlready({ href: dest, label: result.workspace_slug ? "Open workspace" : "Continue" });
        return;
      }
      router.replace(dest);
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
      <InviteCard preview={preview} already={already}>
        {!isSignedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Sign in with <strong>{preview.email}</strong> to accept.
            </p>
            <SocialSignIn onSignedIn={async () => void (await refreshSession())} />
            {showPassword ? (
              <div className="flex gap-2 text-xs">
                <Link
                  href={`/auth/sign-in?redirect_url=/invites/${token}`}
                  className="flex-1 text-center border border-gray-200 rounded-md py-2 font-medium text-gray-700"
                >
                  Email sign-in (test accounts)
                </Link>
                <Link
                  href={`/auth/sign-up?redirect_url=/invites/${token}`}
                  className="flex-1 text-center border border-gray-200 rounded-md py-2 font-medium text-gray-700"
                >
                  Email sign-up (test accounts)
                </Link>
              </div>
            ) : (
              <PasswordUsersNote />
            )}
          </div>
        ) : (
          <>
          {user?.email && user.email.toLowerCase() !== preview.email.toLowerCase() && (
            <p className="mb-3 text-xs text-amber-700">
              You&apos;re signed in as {user.email}. This invite is for {preview.email}; sign out and use
              that account to accept it.
            </p>
          )}
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={preview.status === "revoked" || preview.expired || acceptMutation.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-medium"
          >
            {acceptMutation.isPending ? "Accepting..." : preview.consumed ? "Continue" : "Accept and open"}
          </button>
          </>
        )}

        {acceptMutation.isError && (
          <p className="mt-3 text-xs text-red-600">{friendlyError(acceptMutation.error)}</p>
        )}
      </InviteCard>
    </div>
  );
}
