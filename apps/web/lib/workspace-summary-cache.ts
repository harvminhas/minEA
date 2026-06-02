import type { QueryClient } from "@tanstack/react-query";

/** Landing metrics change only when repository / views data changes. */
export const WORKSPACE_SUMMARY_STALE_MS = 5 * 60 * 1000;
export const WORKSPACE_SUMMARY_GC_MS = 30 * 60 * 1000;

export function workspaceDashboardQueryKey(orgSlug: string, workspaceSlug: string) {
  return ["workspace-dashboard", orgSlug, workspaceSlug] as const;
}

export function repositoryNavCountsQueryKey(orgSlug: string, workspaceSlug: string) {
  return ["repository-nav-counts", orgSlug, workspaceSlug] as const;
}

/** Invalidate cached landing + sidebar counts after repository edits. */
export function invalidateWorkspaceSummary(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
    }),
    queryClient.invalidateQueries({
      queryKey: repositoryNavCountsQueryKey(orgSlug, workspaceSlug),
    }),
    queryClient.invalidateQueries({
      queryKey: ["metric-drawer"],
      predicate: (q) =>
        q.queryKey[0] === "metric-drawer" &&
        q.queryKey[2] === orgSlug &&
        q.queryKey[3] === workspaceSlug,
    }),
  ]);
}
