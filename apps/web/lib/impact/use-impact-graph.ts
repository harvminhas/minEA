"use client";

import { useMemo } from "react";
import { OBJECT_TYPE_LABELS, type ObjectType } from "@minea/types";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { graphFrom } from "@/lib/ask/deterministic";
import type { ImpactNode } from "@/lib/impact/relationship-impact";

export function useImpactGraph() {
  const catalog = useModelCatalog();

  const graph = useMemo(() => {
    const nodes = new Map<string, ImpactNode>();
    for (const row of catalog.data?.rows ?? []) nodes.set(row.id, { id: row.id, name: row.name, typeLabel: row.typeLabel });
    for (const object of catalog.data?.objects ?? []) {
      if (nodes.has(object.id)) continue;
      const capability = object.type === "capability" || object.type === "technical_capability";
      if (object.type === "location") nodes.set(object.id, { id: object.id, name: object.name, typeLabel: "Location" });
      else if (object.type === "external_party") nodes.set(object.id, { id: object.id, name: object.name, typeLabel: "Outside the company" });
      else if (capability || object.type === "component") {
        nodes.set(object.id, { id: object.id, name: object.name, typeLabel: OBJECT_TYPE_LABELS[object.type] ?? "Item" });
      }
    }
    const unnamed = (type: ObjectType) => {
      const label = OBJECT_TYPE_LABELS[type] ?? "Item";
      return { typeLabel: label, name: `Unnamed ${label.toLowerCase()}` };
    };
    const relationships = catalog.data?.relationships ?? [];
    for (const rel of relationships) {
      if (!nodes.has(rel.from_object_id)) nodes.set(rel.from_object_id, { id: rel.from_object_id, ...unnamed(rel.from_type) });
      if (!nodes.has(rel.to_object_id)) nodes.set(rel.to_object_id, { id: rel.to_object_id, ...unnamed(rel.to_type) });
    }
    return { ...graphFrom([...nodes.values()], relationships), relationships };
  }, [catalog.data]);

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    relationships: graph.relationships,
    isLoading: catalog.isLoading,
  };
}
