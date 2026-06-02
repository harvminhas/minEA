"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { workspacesApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import {
  WORKSPACE_SUMMARY_GC_MS,
  WORKSPACE_SUMMARY_STALE_MS,
  invalidateWorkspaceSummary,
  workspaceDashboardQueryKey,
} from "@/lib/workspace-summary-cache";

export { workspaceDashboardQueryKey };

/** Invalidate landing metrics after onboarding or repository changes. */
export function refreshWorkspaceDashboard(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string
) {
  return invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
}

function summaryToMetrics(summary: {
  domain_count: number;
  capability_count: number;
  system_count: number;
  product_count: number;
  process_count: number;
  journey_count: number;
  investment_count: number;
  map_initialized: boolean;
}): WorkspaceMetrics {
  return {
    domainCount: summary.domain_count,
    capabilityCount: summary.capability_count,
    systemCount: summary.system_count,
    productCount: summary.product_count,
    processCount: summary.process_count,
    journeyCount: summary.journey_count,
    investmentCount: summary.investment_count,
    mapInitialized: summary.map_initialized,
  };
}

export async function fetchWorkspaceMetrics(
  orgSlug: string,
  workspaceSlug: string,
  getToken: () => Promise<string | null>
): Promise<WorkspaceMetrics> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const summary = await workspacesApi.getSummary(orgSlug, workspaceSlug, token);
  return summaryToMetrics(summary);
}

export function useWorkspaceDashboard(orgSlug: string, workspaceSlug: string) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  return useQuery({
    queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
    enabled,
    queryFn: () => fetchWorkspaceMetrics(orgSlug, workspaceSlug, getToken),
    staleTime: WORKSPACE_SUMMARY_STALE_MS,
    gcTime: WORKSPACE_SUMMARY_GC_MS,
    refetchOnWindowFocus: false,
  });
}
