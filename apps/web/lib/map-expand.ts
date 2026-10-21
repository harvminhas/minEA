import { MarkerType, type Edge, type Node } from "reactflow";
import type { MinEAObject, Relationship } from "@minea/types";
import { relationshipPhrase } from "@/lib/relationship-display";
import { isTechDebtRelationship } from "@/lib/relationship-display";
import { connectorHref } from "@/lib/connected-via";
import { rowFromObject } from "@/lib/model-catalog";
import { modelItemPath, sectionForKind } from "@/lib/mvp-paths";

/** Revealed per expanded node before "+N more", and across the whole map. */
export const PER_NODE_CAP = 5;
export const TOTAL_CAP = 25;
const REVEAL_DX = 280;
const REVEAL_DY = 92;

export type MapNeighbor = {
  objectId: string;
  name: string;
  objectType: string;
  /** Read from the neighbor's side: "Consumes", "Hosts". */
  phrase: string;
  /** Read from the expanded node's side: "Consumed by", "Hosted on". */
  edgeLabel: string;
  /** The forward words, read along the arrow ("consumes" on warehouse → API). */
  edgeWords: string;
  /** Some link runs from the expanded record to this one / from this one to the expanded record. */
  towardNeighbor: boolean;
  fromNeighbor: boolean;
};

/** Everything one record links to, tech debt left out, one entry per record, A–Z. */
export function mapNeighbors(
  objectId: string,
  relationships: readonly Relationship[],
  objectsById: ReadonlyMap<string, MinEAObject>
): MapNeighbor[] {
  const byId = new Map<string, MapNeighbor>();
  for (const rel of relationships) {
    if (isTechDebtRelationship(rel)) continue;
    if (rel.from_object_id !== objectId && rel.to_object_id !== objectId) continue;
    const otherId = rel.from_object_id === objectId ? rel.to_object_id : rel.from_object_id;
    if (otherId === objectId) continue;
    const other = objectsById.get(otherId);
    if (!other) continue;
    const phrase = relationshipPhrase(rel, otherId);
    const edgeLabel = relationshipPhrase(rel, objectId);
    const words = relationshipPhrase(rel, rel.from_object_id).toLowerCase();
    const fromNeighbor = rel.from_object_id === otherId;
    const seen = byId.get(otherId);
    if (seen) {
      if (!seen.phrase.split(", ").includes(phrase)) seen.phrase += `, ${phrase}`;
      if (!seen.edgeLabel.split(", ").includes(edgeLabel)) seen.edgeLabel += `, ${edgeLabel}`;
      if (!seen.edgeWords.split(", ").includes(words)) seen.edgeWords += `, ${words}`;
      if (fromNeighbor) seen.fromNeighbor = true;
      else seen.towardNeighbor = true;
      continue;
    }
    byId.set(otherId, {
      objectId: otherId,
      name: other.name?.trim() || "Untitled",
      objectType: other.type,
      phrase,
      edgeLabel,
      edgeWords: words,
      fromNeighbor,
      towardNeighbor: !fromNeighbor,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.objectId.localeCompare(b.objectId));
}

/** The record a map node stands for (center, linked, peer, flow or revealed node). */
export function nodeObjectId(node: Pick<Node, "data">): string | null {
  const data = (node.data ?? {}) as { link?: { objectId?: string }; flow?: { id?: string }; system?: { id?: string } };
  return data.link?.objectId ?? data.flow?.id ?? data.system?.id ?? null;
}

export type MapNodeExtras = { badge?: number; expanded?: boolean; revealed?: boolean; selected?: boolean };

/**
 * Add one hop around each expanded record (dashed nodes to its right, capped), then mark every node with
 * how many of its links are still off the map (the "+N" badge). Nothing here is saved.
 */
export function expandSystemGraph(
  base: { nodes: Node[]; edges: Edge[] },
  options: {
    expanded: readonly string[];
    relationships: readonly Relationship[];
    objects: readonly MinEAObject[];
    selectedId?: string | null;
    compact?: boolean;
    /** Saved positions; revealed nodes found here keep them, the rest are auto-placed. */
    savedLayout?: Record<string, Point>;
  }
): { nodes: Node[]; edges: Edge[] } {
  const objectsById = new Map(options.objects.map((object) => [object.id, object]));
  const nodes = base.nodes.map((node) => ({ ...node, data: { ...node.data } }));
  const edges = [...base.edges];
  const nodeIdByObject = new Map<string, string>();
  for (const node of nodes) {
    const id = nodeObjectId(node);
    if (id && !nodeIdByObject.has(id)) nodeIdByObject.set(id, node.id);
  }
  const centerObjectId = nodes.find((node) => node.id === "system-center") ? nodeObjectId(nodes.find((node) => node.id === "system-center")!) : null;
  const linked = (a: string, b: string) => edges.some((edge) => (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a));

  let budget = TOTAL_CAP;
  const expandedSet = new Set(options.expanded);
  for (const objectId of options.expanded) {
    const parentNodeId = nodeIdByObject.get(objectId);
    const parent = nodes.find((node) => node.id === parentNodeId);
    if (!parent || !parentNodeId) continue;
    const neighbors = mapNeighbors(objectId, options.relationships, objectsById);
    const hidden = neighbors.filter((item) => !nodeIdByObject.has(item.objectId));
    const reveal = hidden.slice(0, Math.min(PER_NODE_CAP, budget));
    budget -= reveal.length;
    const overflow = hidden.length - reveal.length;
    const slots = reveal.length + (overflow > 0 ? 1 : 0);
    const y0 = parent.position.y - ((slots - 1) * REVEAL_DY) / 2;
    const y1 = y0 + Math.max(slots - 1, 0) * REVEAL_DY;
    // Step further right while the column would sit on top of nodes already on the map.
    let x = parent.position.x + REVEAL_DX;
    if (slots > 0) {
      for (let guard = 0; guard < 12; guard += 1) {
        const blocked = nodes.some(
          (node) => node.id !== parentNodeId && Math.abs(node.position.x - x) < 220 && node.position.y > y0 - 80 && node.position.y < y1 + 80
        );
        if (!blocked) break;
        x += REVEAL_DX;
      }
    }
    const dashed = { stroke: REVEAL_EDGE_COLOR, strokeWidth: 1.5, strokeDasharray: "5 4" };
    for (const item of neighbors) {
      const shownId = nodeIdByObject.get(item.objectId);
      if (shownId && !linked(parentNodeId, shownId)) {
        edges.push(revealEdge(`xe-${objectId}-${item.objectId}`, parentNodeId, shownId, item, dashed));
      }
    }
    reveal.forEach((item, i) => {
      const nodeId = `x-${item.objectId}`;
      nodes.push({
        id: nodeId,
        type: "systemLinkedNode",
        position: options.savedLayout?.[nodeId] ?? { x, y: y0 + i * REVEAL_DY },
        data: {
          link: { objectId: item.objectId, name: item.name, objectType: item.objectType, direction: "outbound", relationshipTypes: [] },
          revealed: true,
        },
      });
      nodeIdByObject.set(item.objectId, nodeId);
      edges.push(revealEdge(`xe-${objectId}-${item.objectId}`, parentNodeId, nodeId, item, dashed));
    });
    if (overflow > 0) {
      nodes.push({
        id: `more-${objectId}`,
        type: "systemMoreNode",
        position: { x, y: y0 + reveal.length * REVEAL_DY },
        data: { count: overflow, parentObjectId: objectId },
      });
      const rest = hidden.slice(reveal.length);
      edges.push(
        revealEdge(`xe-${objectId}-more`, parentNodeId, `more-${objectId}`, {
          edgeWords: "",
          towardNeighbor: rest.some((item) => item.towardNeighbor),
          fromNeighbor: rest.some((item) => item.fromNeighbor),
        }, dashed)
      );
    }
  }

  for (const node of nodes) {
    if (node.type === "systemMoreNode") continue;
    const objectId = nodeObjectId(node);
    if (!objectId) continue;
    const extras: MapNodeExtras = {
      expanded: expandedSet.has(objectId),
      selected: options.selectedId === objectId,
    };
    if (objectId !== centerObjectId) {
      const hidden = mapNeighbors(objectId, options.relationships, objectsById).filter((item) => !nodeIdByObject.has(item.objectId)).length;
      if (hidden > 0 || extras.expanded) extras.badge = hidden;
    }
    Object.assign(node.data, extras);
  }
  return { nodes, edges };
}

export const REVEAL_EDGE_COLOR = "#818cf8";

/**
 * The line is drawn expanded node → revealed node (that is where the handles sit), and the arrowhead
 * marks the link's true direction: at the revealed end when the link runs to it, at the expanded end
 * when it runs from it (both for links each way). The label is the forward words, read along the arrow.
 */
function revealEdge(
  id: string,
  source: string,
  target: string,
  item: Pick<MapNeighbor, "edgeWords" | "towardNeighbor" | "fromNeighbor">,
  style: Record<string, string | number>
): Edge {
  const marker = { type: MarkerType.ArrowClosed, color: REVEAL_EDGE_COLOR, width: 12, height: 12 };
  return {
    id,
    source,
    sourceHandle: "right",
    target,
    targetHandle: "left",
    type: "smoothstep",
    style,
    markerEnd: item.towardNeighbor ? marker : undefined,
    markerStart: item.fromNeighbor ? marker : undefined,
    label: item.edgeWords,
    labelStyle: { fill: "#64748b", fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  };
}

type Point = { x: number; y: number };

/** Saved positions from node_layout, keyed by node id (direct links and revealed "x-" nodes). */
export function savedPositions(nodeLayout: unknown): Record<string, Point> {
  if (!nodeLayout || typeof nodeLayout !== "object") return {};
  return Object.fromEntries(
    Object.entries(nodeLayout as Record<string, unknown>).filter(
      ([id, value]) =>
        id !== "expanded" &&
        !!value &&
        typeof (value as Point).x === "number" &&
        typeof (value as Point).y === "number"
    )
  ) as Record<string, Point>;
}

/** Expanded record ids saved in node_layout.expanded (anything malformed is ignored). */
export function savedExpanded(nodeLayout: unknown): string[] {
  const list = (nodeLayout as { expanded?: unknown } | null | undefined)?.expanded;
  return Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === "string" && id.length > 0))] : [];
}

/** Saved expansions plus the node clicked on the small map (if any). */
export function initialExpanded(nodeLayout: unknown, clickedId?: string | null): string[] {
  const saved = savedExpanded(nodeLayout);
  return clickedId && !saved.includes(clickedId) ? [...saved, clickedId] : saved;
}

/**
 * What goes into node_layout: positions for direct links and revealed nodes ("+N more" stays auto-placed),
 * plus the expanded record ids when there are any.
 */
export function savableLayout(layout: Record<string, unknown>, expanded: readonly string[] = []): Record<string, Point> {
  const positions = Object.fromEntries(Object.entries(savedPositions(layout)).filter(([id]) => !id.startsWith("more-")));
  const ids = [...new Set(expanded)];
  return (ids.length ? { ...positions, expanded: ids } : positions) as Record<string, Point>;
}

/** Where "Open" goes for a record on the map, or null when it has no page of its own. */
export function objectOpenHref(basePath: string, object: MinEAObject): string | null {
  const row = rowFromObject(object);
  if (row) return modelItemPath(basePath, sectionForKind(row.kind), object.id);
  const section = ({ agent: "agents", ai_model: "ai-models", location: "locations", external_party: "vendors", capability: "capabilities" } as const)[object.type as string];
  if (section) return modelItemPath(basePath, section, object.id);
  if (["api", "event", "integration_flow", "tool", "data_store", "data_object"].includes(object.type)) {
    return connectorHref(basePath, object.type, object.id);
  }
  return null;
}

/** Changes only when the expanded set changes (not on drags or order), so the full map re-fits then. */
export function expansionFitKey(expanded: readonly string[]): string {
  return [...new Set(expanded)].sort().join("|");
}
