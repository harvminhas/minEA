"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { otherRelationshipObjectId } from "@/lib/relationship-display";
import { useTenancy } from "@/lib/tenancy";

export function useSystemLinkedNames(
  system: MinEAObject | null | undefined,
  relationships: Relationship[]
) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const relatedIds = useMemo(() => {
    if (!system) return [];
    const ids = new Set<string>();
    for (const rel of relationships) {
      ids.add(otherRelationshipObjectId(rel, system.id));
    }
    return [...ids];
  }, [relationships, system]);

  const nameQueries = useQueries({
    queries: relatedIds.map((id) => ({
      queryKey: ["object", orgSlug, workspaceSlug, id],
      queryFn: async () => {
        const token = await getToken();
        return objectsApi.get(orgSlug, workspaceSlug, id, token!);
      },
    })),
  });

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    if (system) map[system.id] = system.name;
    for (const query of nameQueries) {
      if (query.data) map[query.data.id] = query.data.name;
    }
    return map;
  }, [nameQueries, system]);

  const isLoading = nameQueries.some((q) => q.isLoading);

  return { nameById, isLoading };
}
