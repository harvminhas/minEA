import type { Edge, Node } from "reactflow";
import { MarkerType } from "reactflow";
import type { ProductGraphEdge, ProductGraphNode, ProductGraphResponse } from "@minea/types";

export interface PortfolioArchitectureSummary {
  productCount: number;
  sharedSystemCount: number;
  sharedCapabilityCount: number;
  sharedSystemNames: string[];
  sharedCapabilityNames: string[];
}

export type PortfolioGraphNodeData = ProductGraphNode & {
  /** How many products touch this node (overlap / coupling). */
  sharedCount?: number;
};

const LAYER_X: Record<number, number> = {
  0: 72,
  1: 380,
  2: 720,
  3: 1040,
};

const ROW_HEIGHT = 52;

function indexEdges(edges: ProductGraphEdge[]) {
  const outgoing = new Map<string, ProductGraphEdge[]>();
  const incoming = new Map<string, ProductGraphEdge[]>();
  for (const edge of edges) {
    (outgoing.get(edge.source) ?? outgoing.set(edge.source, []).get(edge.source)!).push(edge);
    (incoming.get(edge.target) ?? incoming.set(edge.target, []).get(edge.target)!).push(edge);
  }
  return { outgoing, incoming };
}

function isDeliversEdge(label: string): boolean {
  return label.toLowerCase().includes("deliver");
}

function isSupportsEdge(label: string): boolean {
  const normalized = label.toLowerCase();
  return normalized.includes("support");
}

/** Capabilities linked to a system via supports / supported_by (either edge direction). */
function capabilitiesForSystem(
  systemId: string,
  incoming: Map<string, ProductGraphEdge[]>,
  outgoing: Map<string, ProductGraphEdge[]>,
  nodesById: Map<string, ProductGraphNode>
): string[] {
  const capIds = new Set<string>();
  for (const edge of outgoing.get(systemId) ?? []) {
    if (isSupportsEdge(edge.label) && nodesById.get(edge.target)?.layer === 1) {
      capIds.add(edge.target);
    }
  }
  for (const edge of incoming.get(systemId) ?? []) {
    if (isSupportsEdge(edge.label) && nodesById.get(edge.source)?.layer === 1) {
      capIds.add(edge.source);
    }
  }
  return [...capIds];
}

/** Systems linked to a capability via supports / supported_by (either edge direction). */
function systemsForCapability(
  capId: string,
  incoming: Map<string, ProductGraphEdge[]>,
  outgoing: Map<string, ProductGraphEdge[]>,
  nodesById: Map<string, ProductGraphNode>
): string[] {
  const systemIds = new Set<string>();
  for (const edge of outgoing.get(capId) ?? []) {
    if (isSupportsEdge(edge.label) && nodesById.get(edge.target)?.layer === 2) {
      systemIds.add(edge.target);
    }
  }
  for (const edge of incoming.get(capId) ?? []) {
    if (isSupportsEdge(edge.label) && nodesById.get(edge.source)?.layer === 2) {
      systemIds.add(edge.source);
    }
  }
  return [...systemIds];
}

/** Merge per-product graphs — shared entities dedupe by id so overlap is visible. */
export function mergeProductGraphs(graphs: ProductGraphResponse[]): ProductGraphResponse {
  const nodeMap = new Map<string, ProductGraphNode>();
  const edgeMap = new Map<string, ProductGraphEdge>();

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (!nodeMap.has(node.id)) nodeMap.set(node.id, node);
    }
    for (const edge of graph.edges) {
      edgeMap.set(edge.id, edge);
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  };
}

function productsForCapability(
  capId: string,
  incoming: Map<string, ProductGraphEdge[]>,
  nodesById: Map<string, ProductGraphNode>
): Set<string> {
  const products = new Set<string>();
  for (const edge of incoming.get(capId) ?? []) {
    if (!isDeliversEdge(edge.label)) continue;
    const source = nodesById.get(edge.source);
    if (source?.type === "product" || source?.layer === 0) {
      products.add(edge.source);
    }
  }
  return products;
}

export function summarizePortfolioArchitecture(
  graph: ProductGraphResponse
): PortfolioArchitectureSummary {
  const { incoming, outgoing } = indexEdges(graph.edges);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const products = graph.nodes.filter((n) => n.type === "product" || n.layer === 0);

  const sharedCapabilityNames: string[] = [];
  for (const node of graph.nodes.filter((n) => n.layer === 1)) {
    if (productsForCapability(node.id, incoming, nodesById).size > 1) {
      sharedCapabilityNames.push(node.label);
    }
  }

  const sharedSystemNames: string[] = [];
  for (const node of graph.nodes.filter((n) => n.layer === 2)) {
    const capIds = capabilitiesForSystem(node.id, incoming, outgoing, nodesById);

    const productIds = new Set<string>();
    for (const capId of capIds) {
      for (const pid of productsForCapability(capId, incoming, nodesById)) {
        productIds.add(pid);
      }
    }
    if (productIds.size > 1) sharedSystemNames.push(node.label);
  }

  return {
    productCount: products.length,
    sharedCapabilityCount: sharedCapabilityNames.length,
    sharedSystemCount: sharedSystemNames.length,
    sharedCapabilityNames,
    sharedSystemNames,
  };
}

function sharedCounts(
  graph: ProductGraphResponse
): Map<string, number> {
  const { incoming, outgoing } = indexEdges(graph.edges);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const counts = new Map<string, number>();

  for (const node of graph.nodes) {
    if (node.layer === 1) {
      counts.set(node.id, productsForCapability(node.id, incoming, nodesById).size);
      continue;
    }
    if (node.layer === 2) {
      const capIds = capabilitiesForSystem(node.id, incoming, outgoing, nodesById);

      const productIds = new Set<string>();
      for (const capId of capIds) {
        for (const pid of productsForCapability(capId, incoming, nodesById)) {
          productIds.add(pid);
        }
      }
      counts.set(node.id, productIds.size);
    }
  }

  return counts;
}

function autoLayoutPortfolio(graph: ProductGraphResponse): Map<string, { x: number; y: number }> {
  const { outgoing, incoming } = indexEdges(graph.edges);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const positions = new Map<string, { x: number; y: number }>();

  const products = graph.nodes
    .filter((n) => n.type === "product" || n.layer === 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  let yCursor = 40;

  for (const product of products) {
    const capIds = (outgoing.get(product.id) ?? [])
      .filter((e) => isDeliversEdge(e.label))
      .map((e) => e.target);

    const bandStart = yCursor;
    positions.set(product.id, { x: LAYER_X[0]!, y: bandStart });

    if (capIds.length === 0) {
      yCursor += ROW_HEIGHT * 2;
      continue;
    }

    let capY = bandStart;
    for (const capId of capIds) {
      if (!positions.has(capId)) {
        positions.set(capId, { x: LAYER_X[1]!, y: capY });
      }
      capY += ROW_HEIGHT;
    }

    yCursor = Math.max(yCursor + ROW_HEIGHT * 2, capY + 20);
  }

  const avgY = (ids: string[]) => {
    const ys = ids
      .map((id) => positions.get(id)?.y)
      .filter((y): y is number => y !== undefined);
    if (!ys.length) return yCursor;
    return ys.reduce((sum, y) => sum + y, 0) / ys.length;
  };

  for (const node of graph.nodes.filter((n) => n.layer === 2)) {
    const capIds = capabilitiesForSystem(node.id, incoming, outgoing, nodesById);
    positions.set(node.id, { x: LAYER_X[2]!, y: avgY(capIds) });
  }

  for (const node of graph.nodes.filter((n) => n.layer === 3)) {
    const sourceIds = (incoming.get(node.id) ?? []).map((e) => e.source);
    positions.set(node.id, { x: LAYER_X[3]!, y: avgY(sourceIds) });
  }

  for (const node of graph.nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, {
        x: LAYER_X[node.layer] ?? 400,
        y: yCursor,
      });
      yCursor += ROW_HEIGHT;
    }
  }

  return positions;
}

export function buildPortfolioArchitectureGraph(
  graph: ProductGraphResponse
): { nodes: Node<PortfolioGraphNodeData>[]; edges: Edge[]; summary: PortfolioArchitectureSummary } {
  const summary = summarizePortfolioArchitecture(graph);
  const sharing = sharedCounts(graph);
  const positions = autoLayoutPortfolio(graph);

  const nodes: Node<PortfolioGraphNodeData>[] = graph.nodes.map((node) => ({
    id: node.id,
    type: "graphNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      ...node,
      sharedCount: sharing.get(node.id),
    },
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#94a3b8" },
    style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
    labelStyle: { fill: "#64748b", fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
  }));

  return { nodes, edges, summary };
}

export const PORTFOLIO_LAYER_LABELS: Record<number, string> = {
  0: "Products",
  1: "Capabilities",
  2: "Systems",
  3: "Dependencies",
};

/** Short labels for layer toggle buttons. */
export const PORTFOLIO_LAYER_TOGGLE_LABELS: Record<number, string> = {
  0: "Products",
  1: "Caps",
  2: "Systems",
  3: "Deps",
};

/** Keep only nodes/edges tied to selected products (and optional layer toggles). */
export function filterPortfolioGraphRaw(
  graph: ProductGraphResponse,
  visibleProductIds: Set<string>,
  layerVisibility: Record<number, boolean>
): ProductGraphResponse {
  if (visibleProductIds.size === 0) {
    return { nodes: [], edges: [] };
  }

  const { incoming, outgoing } = indexEdges(graph.edges);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const includedCaps = new Set<string>();
  for (const node of graph.nodes) {
    if (node.layer !== 1) continue;
    for (const productId of productsForCapability(node.id, incoming, nodesById)) {
      if (visibleProductIds.has(productId)) {
        includedCaps.add(node.id);
        break;
      }
    }
  }

  const includedSystems = new Set<string>();
  for (const capId of includedCaps) {
    for (const systemId of systemsForCapability(capId, incoming, outgoing, nodesById)) {
      includedSystems.add(systemId);
    }
  }

  const includedArch = new Set<string>([...includedCaps, ...includedSystems]);
  const includedDeps = new Set<string>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of graph.nodes) {
      if (node.layer !== 3 || includedDeps.has(node.id)) continue;
      for (const edge of [...(outgoing.get(node.id) ?? []), ...(incoming.get(node.id) ?? [])]) {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const other = nodesById.get(otherId);
        if (!other || other.layer === 0) continue;
        if (includedArch.has(otherId)) {
          includedDeps.add(node.id);
          includedArch.add(node.id);
          expanded = true;
          break;
        }
      }
    }
  }

  const includeNode = (node: ProductGraphNode) => {
    if (node.layer === 0) return visibleProductIds.has(node.id);
    if (layerVisibility[node.layer] === false) return false;
    if (node.layer === 1) return includedCaps.has(node.id);
    if (node.layer === 2) return includedSystems.has(node.id);
    if (node.layer === 3) return includedDeps.has(node.id);
    return includedArch.has(node.id);
  };

  const nodes = graph.nodes.filter(includeNode);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
  );

  return { nodes, edges };
}

export function filterPortfolioGraphView(
  graph: ProductGraphResponse,
  visibleProductIds: Set<string>,
  layerVisibility: Record<number, boolean>
): { visibleNodes: Node<PortfolioGraphNodeData>[]; visibleEdges: Edge[] } {
  const filtered = filterPortfolioGraphRaw(graph, visibleProductIds, layerVisibility);
  const built = buildPortfolioArchitectureGraph(filtered);
  return { visibleNodes: built.nodes, visibleEdges: built.edges };
}
