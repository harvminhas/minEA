import type { QueryClient } from "@tanstack/react-query";

/** Invalidate product list, detail, and architecture graph after product edits. */
export function invalidateProductQueries(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string,
  productId?: string
) {
  queryClient.invalidateQueries({ queryKey: ["products", orgSlug, workspaceSlug] });
  if (productId) {
    queryClient.invalidateQueries({ queryKey: ["product", orgSlug, workspaceSlug, productId] });
    queryClient.invalidateQueries({ queryKey: ["product-graph", orgSlug, workspaceSlug, productId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ["product-graph", orgSlug, workspaceSlug] });
  }
}
