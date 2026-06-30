import type { QueryClient } from "@tanstack/react-query";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";

/** Invalidate product list, detail, and architecture graph after product edits. */
export function invalidateProductQueries(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string,
  productId?: string
) {
  void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
  queryClient.invalidateQueries({ queryKey: ["products", orgSlug, workspaceSlug] });
  queryClient.invalidateQueries({ queryKey: ["domain-products", orgSlug, workspaceSlug] });
  queryClient.invalidateQueries({ queryKey: ["portfolio-architecture", orgSlug, workspaceSlug] });
  if (productId) {
    queryClient.invalidateQueries({ queryKey: ["product", orgSlug, workspaceSlug, productId] });
    queryClient.invalidateQueries({ queryKey: ["product-history", orgSlug, workspaceSlug, productId] });
    queryClient.invalidateQueries({ queryKey: ["product-graph", orgSlug, workspaceSlug, productId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ["product-graph", orgSlug, workspaceSlug] });
  }
}
