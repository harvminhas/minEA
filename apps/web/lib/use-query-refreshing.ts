import type { UseQueryResult } from "@tanstack/react-query";

/** True when a query is refetching after it already has data (not the first load). */
export function useQueryRefreshing(
  query: Pick<UseQueryResult<unknown>, "isFetching" | "isLoading">
): boolean {
  return query.isFetching && !query.isLoading;
}
