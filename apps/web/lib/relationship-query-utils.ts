import type { Relationship } from "@minea/types";
import type { QueryClient } from "@tanstack/react-query";
import { relationshipsApi } from "@/lib/api-client";

export function relationshipQueryKeys(objectId: string) {
  return {
    from: ["relationships", "from", objectId] as const,
    to: ["relationships", "to", objectId] as const,
  };
}

/** Fetch and write relationship lists so open drawers update immediately. */
export async function refreshObjectRelationshipQueries(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string,
  objectId: string,
  token: string
): Promise<{ outbound: Relationship[]; inbound: Relationship[] }> {
  const keys = relationshipQueryKeys(objectId);
  const [outbound, inbound] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: keys.from,
      queryFn: () =>
        relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: objectId }, token),
      staleTime: 0,
    }),
    queryClient.fetchQuery({
      queryKey: keys.to,
      queryFn: () =>
        relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: objectId }, token),
      staleTime: 0,
    }),
  ]);
  return { outbound, inbound };
}