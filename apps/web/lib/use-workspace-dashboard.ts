"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import {
  capabilityMapApi,
  journeysApi,
  objectsApi,
  processesApi,
  productsApi,
} from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";

export function workspaceDashboardQueryKey(orgSlug: string, workspaceSlug: string) {
  return ["workspace-dashboard", orgSlug, workspaceSlug] as const;
}

/** Force a fresh fetch after onboarding or repository changes. */
export function refreshWorkspaceDashboard(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string
) {
  return queryClient.refetchQueries({
    queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
  });
}

async function countSystems(orgSlug: string, workspaceSlug: string, token: string): Promise<number> {
  const types = ["application", "solution", "technical_capability"] as const;
  const totals = await Promise.all(
    types.map((type) =>
      objectsApi.list(orgSlug, workspaceSlug, { type, page: 1 }, token).then((r) => r.total)
    )
  );
  return totals.reduce((sum, n) => sum + n, 0);
}

export function useWorkspaceDashboard(orgSlug: string, workspaceSlug: string) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  return useQuery({
    queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
    enabled,
    queryFn: async (): Promise<WorkspaceMetrics> => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const [status, products, processes, journeys, systemCount, roadmap] = await Promise.all([
        capabilityMapApi.getStatus(orgSlug, workspaceSlug, token),
        productsApi.list(orgSlug, workspaceSlug, token),
        processesApi.list(orgSlug, workspaceSlug, token),
        journeysApi.list(orgSlug, workspaceSlug, token),
        countSystems(orgSlug, workspaceSlug, token),
        objectsApi.list(orgSlug, workspaceSlug, { type: "roadmap_item", page: 1 }, token),
      ]);

      return {
        domainCount: status.domain_count,
        capabilityCount: status.capability_count,
        systemCount,
        productCount: products.total,
        processCount: processes.total,
        journeyCount: journeys.total,
        investmentCount: roadmap.total,
        mapInitialized: status.initialized,
      };
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
