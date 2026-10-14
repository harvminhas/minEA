"use client";

import { useMemo } from "react";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { graphFrom } from "@/lib/ask/deterministic";
import { impactNodes } from "@/lib/impact/nodes";

export function useImpactGraph() {
  const catalog = useModelCatalog();

  const graph = useMemo(() => {
    const objects = catalog.data?.objects ?? [];
    const ids = new Set(objects.map((object) => object.id));
    // Only links whose two ends still exist (shapeCatalog already drops the rest; kept here too).
    const relationships = (catalog.data?.relationships ?? []).filter((rel) => ids.has(rel.from_object_id) && ids.has(rel.to_object_id));
    const nodes = impactNodes(catalog.data?.rows ?? [], objects, relationships);
    return { ...graphFrom(nodes, relationships), relationships };
  }, [catalog.data]);

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    relationships: graph.relationships,
    isLoading: catalog.isLoading,
  };
}
