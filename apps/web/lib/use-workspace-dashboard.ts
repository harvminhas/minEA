"use client";

import { useEffect, useRef } from "react";
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

export interface WorkspaceDashboardState {
  metrics: WorkspaceMetrics;
  version: number;
  stale: boolean;
  rebuilding: boolean;
}

/** Invalidate landing metrics after onboarding or repository changes. */
export function refreshWorkspaceDashboard(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string
) {
  return invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
}

function mapSnapshotToState(snapshot: {
  version: number;
  built_at: string | null;
  stale: boolean;
  rebuilding: boolean;
  metrics: {
    domain_count: number;
    capability_count: number;
    system_count: number;
    product_count: number;
    process_count: number;
    journey_count: number;
    investment_count: number;
    map_initialized: boolean;
    incomplete_domain_count?: number;
    capabilities_without_system_count?: number;
    products_without_capabilities_count?: number;
  };
}): WorkspaceDashboardState {
  const m = snapshot.metrics;
  return {
    version: snapshot.version,
    stale: snapshot.stale,
    rebuilding: snapshot.rebuilding,
    metrics: {
      domainCount: m.domain_count,
      capabilityCount: m.capability_count,
      systemCount: m.system_count,
      productCount: m.product_count,
      processCount: m.process_count,
      journeyCount: m.journey_count,
      investmentCount: m.investment_count,
      mapInitialized: m.map_initialized,
      incompleteDomainCount: m.incomplete_domain_count ?? 0,
      capabilitiesWithoutSystemCount: m.capabilities_without_system_count ?? 0,
      productsWithoutCapabilitiesCount: m.products_without_capabilities_count ?? 0,
    },
  };
}

export async function fetchWorkspaceDashboardState(
  orgSlug: string,
  workspaceSlug: string,
  getToken: () => Promise<string | null>
): Promise<WorkspaceDashboardState> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const snapshot = await workspacesApi.getSummary(orgSlug, workspaceSlug, token);
  return mapSnapshotToState(snapshot);
}

/** @deprecated Use fetchWorkspaceDashboardState — returns metrics only. */
export async function fetchWorkspaceMetrics(
  orgSlug: string,
  workspaceSlug: string,
  getToken: () => Promise<string | null>
): Promise<WorkspaceMetrics> {
  const state = await fetchWorkspaceDashboardState(orgSlug, workspaceSlug, getToken);
  return state.metrics;
}

function isSnapshotCatchingUp(data: WorkspaceDashboardState | undefined): boolean {
  return Boolean(data?.stale || data?.rebuilding);
}

export function useWorkspaceDashboard(orgSlug: string, workspaceSlug: string) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);
  const wasCatchingUp = useRef(false);

  const query = useQuery({
    queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
    enabled,
    queryFn: () => fetchWorkspaceDashboardState(orgSlug, workspaceSlug, getToken),
    staleTime: WORKSPACE_SUMMARY_STALE_MS,
    gcTime: WORKSPACE_SUMMARY_GC_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (isSnapshotCatchingUp(q.state.data) ? 2000 : false),
  });

  // Poll stops when rebuilding/stale flip false — force one more fetch for the new version.
  useEffect(() => {
    const catchingUp = isSnapshotCatchingUp(query.data);
    if (wasCatchingUp.current && !catchingUp && enabled) {
      void query.refetch();
    }
    wasCatchingUp.current = catchingUp;
  }, [query.data, query.refetch, enabled]);

  return query;
}
