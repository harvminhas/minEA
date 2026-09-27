"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useTenancy } from "@/lib/tenancy";
import { graphFrom } from "@/lib/ask/deterministic";
import type { ImpactNode } from "@/lib/impact/relationship-impact";

export function useImpactGraph() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const catalog = useModelCatalog();
  const enabled = Boolean(orgSlug && workspaceSlug);

  const relationships = useQuery({
    queryKey: ["impact-relationships", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return [];
      return relationshipsApi.list(orgSlug, workspaceSlug, {}, token);
    },
  });

  const named = useQuery({
    queryKey: ["impact-names", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return [];
      const [capabilities, components] = await Promise.all([
        objectsApi.list(orgSlug, workspaceSlug, { type: "capability", page_size: 200 }, token).catch(() => ({ items: [] })),
        objectsApi.list(orgSlug, workspaceSlug, { type: "component", page_size: 200 }, token).catch(() => ({ items: [] })),
      ]);
      return [...(capabilities.items ?? []), ...(components.items ?? [])];
    },
  });

  const graph = useMemo(() => {
    const nodes = new Map<string, ImpactNode>();
    for (const row of catalog.data?.rows ?? []) nodes.set(row.id, { id: row.id, name: row.name });
    for (const object of named.data ?? []) nodes.set(object.id, { id: object.id, name: object.name });
    for (const rel of relationships.data ?? []) {
      if (!nodes.has(rel.from_object_id)) nodes.set(rel.from_object_id, { id: rel.from_object_id, name: "Linked record" });
      if (!nodes.has(rel.to_object_id)) nodes.set(rel.to_object_id, { id: rel.to_object_id, name: "Linked record" });
    }
    return graphFrom([...nodes.values()], relationships.data ?? []);
  }, [catalog.data?.rows, named.data, relationships.data]);

  return {
    ...graph,
    isLoading: relationships.isLoading || named.isLoading || catalog.isLoading,
  };
}
