"use client";

import { useEffect } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { apiBaseLabel, apiConfigHelpText } from "@/lib/api-base";
import { primaryViewPath } from "@/lib/tenancy";

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
            <p className="text-xs text-gray-400 mt-3">{apiConfigHelpText()}</p>
            <p className="text-xs text-gray-400 mt-2">
              Resolved API base:{" "}
              <code className="bg-gray-100 px-1 rounded">{apiBaseLabel()}</code>
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Loading your workspace...</p>
        )}
      </div>
    </RequireAuth>
  );
}
