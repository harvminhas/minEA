import type { ProductGraphEdge, ProductGraphNode, ProductGraphResponse } from "@minea/types";

export function productGraphLabelById(
  graph: ProductGraphResponse | undefined
): Record<string, ProductGraphNode> {
  const map: Record<string, ProductGraphNode> = {};
  for (const node of graph?.nodes ?? []) {
    map[node.id] = node;
  }
  return map;
}

export function productRelationshipSummary(
  productId: string,
  graph: ProductGraphResponse | undefined
): string {
  const edges = graph?.edges ?? [];
  if (edges.length === 0) {
    return "No linked objects yet — map capabilities and systems to build the relationship map.";
  }

  const nodes = graph?.nodes ?? [];
  const linked = nodes.filter((n) => n.id !== productId);
  const byType = new Map<string, number>();
  for (const node of linked) {
    byType.set(node.type, (byType.get(node.type) ?? 0) + 1);
  }

  const parts = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${count} ${type.replace(/_/g, " ")}${count === 1 ? "" : "s"}`);

  return `${edges.length} connection${edges.length === 1 ? "" : "s"} · ${parts.join(" · ")}`;
}

export function formatProductGraphEdgeLine(
  edge: ProductGraphEdge,
  labelById: Record<string, ProductGraphNode>
): { nameLine: string; typeLine: string } {
  const source = labelById[edge.source];
  const target = labelById[edge.target];
  const sourceLabel = source?.label ?? "Unknown";
  const targetLabel = target?.label ?? "Unknown";
  const relLabel = edge.label.replace(/_/g, " ");

  return {
    nameLine: `${sourceLabel} → ${targetLabel}`,
    typeLine: `${relLabel} · ${source?.type?.replace(/_/g, " ") ?? "object"} → ${target?.type?.replace(/_/g, " ") ?? "object"}`,
  };
}
