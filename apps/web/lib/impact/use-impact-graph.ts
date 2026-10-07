"use client";

import { useMemo } from "react";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { graphFrom } from "@/lib/ask/deterministic";
import { impactNodes } from "@/lib/impact/nodes";

export function useImpactGraph() {
  const catalog = useModelCatalog();

  const graph = useMemo(() => {
    const relationships = catalog.data?.relationships ?? [];
    const nodes = impactNodes(catalog.data?.rows ?? [], catalog.data?.objects ?? [], relationships);
    return { ...graphFrom(nodes, relationships), relationships };
  }, [catalog.data]);

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    relationships: graph.relationships,
    isLoading: catalog.isLoading,
  };
}
