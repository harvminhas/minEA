"use client";

import { MEMBERSHIP_QUERY } from "@/lib/membership-freshness";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { orgsApi } from "@/lib/api-client";
import { apiBaseLabel, apiConfigHelpText } from "@/lib/api-base";
import { useAppStore } from "@/lib/store";
import { useAppStoreHydrated } from "@/lib/use-app-store-hydrated";
import {
  inferViewModeForPath,
  resolvePostLoginDestination,
  splitViewIdForPath,
} from "@/lib/last-app-path";
import { useAppBoot } from "@/lib/app-boot-context";
import { orgSlugFromPath, parsePlanIntent, savePlanIntent, starterBillingHref, takePlanIntent } from "@/lib/billing/plan-intent";

type HomePhase = "orgs" | "workspaces" | "redirect";

export default function HomePage() {
  const { getToken, isLoaded } = useAuth();
  const router = useRouter();
  const { setHomeStep } = useAppBoot();
  const { setViewMode, lastAppPath } = useAppStore();
  const storeHydrated = useAppStoreHydrated();
  const [phase, setPhase] = useState<HomePhase>("orgs");

  const { data: orgs, isLoading, isError, error } = useQuery({
    queryKey: ["orgs"],
    ...MEMBERSHIP_QUERY,
    enabled: isLoaded,
    staleTime: 0,
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.list(token!);
    },
  });

  useEffect(() => {
    if (isLoading || !isLoaded || isError || !storeHydrated) return;

    // "Get Starter" on the pricing page: ?plan=starter, or the intent saved before sign-up.
    const urlIntent = parsePlanIntent(new URLSearchParams(window.location.search).get("plan"));
    const intent = takePlanIntent() ?? urlIntent;

    if (!orgs || orgs.length === 0) {
      if (intent) savePlanIntent(intent); // onboarding creates the org, then goes to billing
      router.replace("/onboarding");
      return;
    }

    setPhase("workspaces");

    (async () => {
      setPhase("redirect");
      // Never get stuck here: if checking the remembered workspace fails, open the first org.
      const { destination, restored } = await resolvePostLoginDestination({
        orgs,
        lastAppPath,
        getToken,
      }).catch(() => ({ destination: `/orgs/${orgs[0].slug}/settings`, restored: false }));
      if (intent === "starter") {
        const slug = orgSlugFromPath(destination) ?? orgs[0].slug;
        router.replace(starterBillingHref(slug));
        return;
      }
      const persistedMode = useAppStore.getState().viewMode;
      if (restored) {
        setViewMode(inferViewModeForPath(destination, persistedMode));
        const splitViewId = splitViewIdForPath(destination);
        if (splitViewId) useAppStore.getState().setSplitViewId(splitViewId);
      } else {
        setViewMode("repository");
      }
      router.replace(destination);
    })();
  }, [orgs, isLoading, isLoaded, isError, storeHydrated, router, getToken, setViewMode, lastAppPath]);

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
