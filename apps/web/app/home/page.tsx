"use client";

import { useEffect } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { resolveApiBase } from "@/lib/api-base";
import { primaryViewPath } from "@/lib/tenancy";

function apiHelpText(): string {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (publicUrl) {
    return `Browser calls ${publicUrl}/api/v1/* directly. Confirm ${publicUrl}/health returns ok.`;
  }
  const proxyTarget = process.env.API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
  return `Browser calls /api/v1/* on this app (proxied to ${proxyTarget}). Confirm ${proxyTarget}/health and run npm run dev from the repo root.`;
}

export default function HomePage() {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();

  const { data: orgs, isLoading, isError, error } = useQuery({
    queryKey: ["orgs"],
    enabled: isLoaded,
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.list(token!);
    },
  });

  useEffect(() => {
    if (isLoading || !isLoaded || isError) return;

    if (!orgs || orgs.length === 0) {
      router.replace("/onboarding");
      return;
    }

    const org = orgs[0]!;
    (async () => {
      const token = await getToken();
      const workspaces = await workspacesApi.list(org.slug, token!);
      const ws = workspaces[0];
      if (ws) {
        router.replace(primaryViewPath(org.slug, ws.slug));
      } else {
        router.replace(`/orgs/${org.slug}/settings`);
      }
    })();
  }, [orgs, isLoading, isLoaded, isError, router, getToken]);

  return (
    <RequireAuth>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {isError ? (
          <div className="text-center max-w-md px-4">
            <p className="text-sm text-red-600 mb-2">API request failed.</p>
            <p className="text-xs text-gray-500 break-words">{(error as Error).message}</p>
            <p className="text-xs text-gray-400 mt-3">{apiHelpText()}</p>
            <p className="text-xs text-gray-400 mt-2">
              Resolved API base:{" "}
              <code className="bg-gray-100 px-1 rounded">
                {resolveApiBase() || "(same-origin proxy)"}
              </code>
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Loading your workspace...</p>
        )}
      </div>
    </RequireAuth>
  );
}
