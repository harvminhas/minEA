"use client";

import type { ViewId } from "@/lib/views";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { viewReadiness } from "@/lib/workspace-dashboard";
import { useWorkspaceDashboard } from "@/lib/use-workspace-dashboard";
import { useTenancy } from "@/lib/tenancy";
import { useShareSession } from "@/lib/share-context";

/** Workspace summary — same cache as the landing dashboard. */
export function useWorkspaceSummary(orgSlug: string, workspaceSlug: string) {
  const query = useWorkspaceDashboard(orgSlug, workspaceSlug);
  return {
    ...query,
    data: query.data?.metrics,
  };
}

export function useWorkspaceSummaryInContext() {
  const { orgSlug, workspaceSlug } = useTenancy();
  return useWorkspaceSummary(orgSlug, workspaceSlug);
}

/** Whether a view has enough repository data to load its heavy endpoint. */
export function viewHasRepositoryData(
  viewId: ViewId | "processes",
  metrics: WorkspaceMetrics
): boolean {
  switch (viewId) {
    case "products":
      return metrics.productCount > 0;
    case "capability-heatmap":
      return metrics.capabilityCount > 0 && metrics.productCount > 0;
    case "processes":
      return metrics.processCount > 0;
    case "journeys":
      return metrics.journeyCount > 0;
    case "investments":
      return metrics.investmentCount > 0;
    case "tech-debt":
      return true;
    default:
      return false;
  }
}

/**
 * Gate view pages on workspace summary — skip list/heatmap fetches when counts are zero.
 */
export function useViewDataGate(viewId: ViewId | "processes") {
  const { orgSlug, workspaceSlug } = useTenancy();
  const shareSession = useShareSession();
  const { data: metrics, isPending: summaryPending, isFetching: summaryFetching } =
    useWorkspaceSummary(orgSlug, workspaceSlug);

  // Share links have no auth/summary — fetch view data directly via the share API.
  if (shareSession) {
    return {
      orgSlug,
      workspaceSlug,
      metrics: undefined,
      summaryPending: false,
      summaryFetching: false,
      hasData: true as const,
      readiness: null,
      skipHeavyFetch: false,
      showEmptyFromSummary: false,
      loading: false,
    };
  }

  const hasData = metrics ? viewHasRepositoryData(viewId, metrics) : undefined;
  const readiness = metrics ? viewReadiness(viewId, metrics) : null;

  return {
    orgSlug,
    workspaceSlug,
    metrics,
    summaryPending,
    summaryFetching,
    /** Undefined while summary is loading; then boolean. */
    hasData,
    readiness,
    skipHeavyFetch: hasData === false,
    showEmptyFromSummary: hasData === false,
    loading: summaryPending || (hasData === true && summaryFetching),
  };
}
