"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { apiBaseLabel, apiConfigHelpText } from "@/lib/api-base";
import { primaryViewPath } from "@/lib/tenancy";
import { useAppBoot } from "@/lib/app-boot-context";

type HomePhase = "orgs" | "workspaces" | "redirect";

export default function HomePage() {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const { setHomeStep } = useAppBoot();
  const [phase, setPhase] = useState<HomePhase>("orgs");

  const { data: orgs, isLoading, isError, error } = useQuery({
    queryKey: ["orgs"],
    enabled: isLoaded,
    staleTime: 0,
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
    setPhase("workspaces");

    (async () => {
      const token = await getToken();
      const workspaces = await workspacesApi.list(org.slug, token!);
      setPhase("redirect");
      const ws = workspaces[0];
      if (ws) {
        router.replace(primaryViewPath(org.slug, ws.slug));
      } else {
        router.replace(`/orgs/${org.slug}/settings`);
      }
    })();
  }, [orgs, isLoading, isLoaded, isError, router, getToken]);

  useEffect(() => {
    setHomeStep(phase === "orgs" ? 0 : phase === "workspaces" ? 1 : 2);
  }, [phase, setHomeStep]);

  return (
    <RequireAuth>
      {isError ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center max-w-md">
            <p className="text-sm text-red-600 mb-2">API request failed.</p>
            <p className="text-xs text-gray-500 break-words">{(error as Error).message}</p>
            <p className="text-xs text-gray-400 mt-3">{apiConfigHelpText()}</p>
            <p className="text-xs text-gray-400 mt-2">
              Resolved API base:{" "}
              <code className="bg-gray-100 px-1 rounded">{apiBaseLabel()}</code>
            </p>
          </div>
        </div>
      ) : null}
    </RequireAuth>
  );
}
