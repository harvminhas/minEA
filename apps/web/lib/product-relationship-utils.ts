import { relationshipLabelFor, type ProductGraphEdge, type ProductGraphNode, type ProductGraphResponse } from "@minea/types";

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

/** The API sends words ("Runs on"); an older build sent the stored code ("runs on" / "runs_on"). */
export function productEdgeLabel(label: string): string {
  if (!/^[a-z_ ]+$/.test(label)) return label;
  if (label === "delivers") return "Delivers";
  return relationshipLabelFor(label.replace(/ /g, "_")).forward;
}

/** One product-graph link as a plain sentence ("Payments delivers Billing"); no codes or kinds line. */
export function formatProductGraphEdgeLine(
  edge: ProductGraphEdge,
  labelById: Record<string, ProductGraphNode>
): { nameLine: string; typeLine: string } {
  const sourceLabel = labelById[edge.source]?.label ?? "Unknown";
  const targetLabel = labelById[edge.target]?.label ?? "Unknown";
  return {
    nameLine: `${sourceLabel} ${productEdgeLabel(edge.label).toLowerCase()} ${targetLabel}`,
    typeLine: "",
  };
}
