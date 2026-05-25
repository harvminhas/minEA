import type { StageDraft } from "@/components/views/ProcessFlowCanvas";
import type { CanvasPoint, Process, ProcessCanvasLayout, ProcessGraphEdge } from "@minea/types";

export type NodeLayoutMap = Record<string, CanvasPoint>;
export type EdgeLabelLayoutMap = Record<string, CanvasPoint>;

export interface StageTransition {
  condition?: string;
  trigger?: string;
  handoff?: string;
}

export interface EdgeDraft {
  sourceId: string;
  targetId: string;
  transition?: StageTransition;
}

export function flowEdgeId(sourceId: string, targetId: string): string {
  return `e-${sourceId}-${targetId}`;
}

export function edgeLayoutIndexKey(stages: StageDraft[], sourceId: string, targetId: string): string {
  const sourceIndex = stages.findIndex((s) => s.id === sourceId);
  const targetIndex = stages.findIndex((s) => s.id === targetId);
  return `${sourceIndex}:${targetIndex}`;
}

export function normalizeTransition(t?: StageTransition): StageTransition | undefined {
  if (!t) return undefined;
  const condition = t.condition?.trim() || undefined;
  const trigger = t.trigger?.trim() || undefined;
  const handoff = t.handoff?.trim() || undefined;
  if (!condition && !trigger && !handoff) return undefined;
  return { condition, trigger, handoff };
}

function roundPoint(point: CanvasPoint): CanvasPoint {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function normalizeEdgeLabels(
  edgeLabels: ProcessCanvasLayout["edge_labels"] | undefined
): Record<string, CanvasPoint> {
  if (!edgeLabels) return {};
  if (Array.isArray(edgeLabels)) return {};
  const out: Record<string, CanvasPoint> = {};
  for (const [key, point] of Object.entries(edgeLabels)) {
    if (point) out[key] = roundPoint(point);
  }
  return out;
}

export function normalizeCanvasLayout(
  layout?: ProcessCanvasLayout | null
): ProcessCanvasLayout | undefined {
  if (!layout) return undefined;
  const edgeLabels = normalizeEdgeLabels(layout.edge_labels);
  return {
    nodes: layout.nodes.map((point) => (point ? roundPoint(point) : null)),
    edge_labels: edgeLabels,
  };
}

export function buildLinearEdges(stages: StageDraft[]): EdgeDraft[] {
  const edges: EdgeDraft[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({
      sourceId: stages[i]!.id,
      targetId: stages[i + 1]!.id,
    });
  }
  return edges;
}

export function edgesFromProcess(process?: Process | null, stages: StageDraft[] = []): EdgeDraft[] {
  if (!stages.length) return [];

  if (process?.graph_edges?.length) {
    return process.graph_edges
      .map((edge) => {
        const source = stages[edge.source_index];
        const target = stages[edge.target_index];
        if (!source || !target) return null;
        return {
          sourceId: source.id,
          targetId: target.id,
          transition: normalizeTransition({
            condition: edge.condition ?? undefined,
            trigger: edge.trigger ?? undefined,
            handoff: edge.handoff ?? undefined,
          }),
        } satisfies EdgeDraft;
      })
      .filter((edge): edge is EdgeDraft => edge !== null);
  }

  const edges = buildLinearEdges(stages);
  return edges.map((edge, index) => ({
    ...edge,
    transition: normalizeTransition({
      condition: process?.stages[index]?.transition_condition ?? undefined,
      trigger: process?.stages[index]?.transition_trigger ?? undefined,
      handoff: process?.stages[index]?.transition_handoff ?? undefined,
    }),
  }));
}

export function edgesToGraph(stages: StageDraft[], edges: EdgeDraft[]): ProcessGraphEdge[] {
  return edges.map((edge) => {
    const transition = normalizeTransition(edge.transition);
    return {
      source_index: stages.findIndex((s) => s.id === edge.sourceId),
      target_index: stages.findIndex((s) => s.id === edge.targetId),
      condition: transition?.condition ?? null,
      trigger: transition?.trigger ?? null,
      handoff: transition?.handoff ?? null,
    };
  }).filter((edge) => edge.source_index >= 0 && edge.target_index >= 0);
}

export function layoutToIndexed(
  stages: StageDraft[],
  nodeLayout: NodeLayoutMap,
  edgeLabelLayout: EdgeLabelLayoutMap,
  edges: EdgeDraft[]
): ProcessCanvasLayout | undefined {
  const nodes = stages.map((stage) => nodeLayout[stage.id] ?? null);
  const edge_labels: Record<string, CanvasPoint> = {};
  for (const edge of edges) {
    const layoutKey = flowEdgeId(edge.sourceId, edge.targetId);
    const offset = edgeLabelLayout[layoutKey];
    if (offset) {
      edge_labels[edgeLayoutIndexKey(stages, edge.sourceId, edge.targetId)] = roundPoint(offset);
    }
  }
  const hasCustom = nodes.some(Boolean) || Object.keys(edge_labels).length > 0;
  if (!hasCustom) return undefined;
  return { nodes, edge_labels };
}

export function layoutFromIndexed(
  stages: StageDraft[],
  layout?: ProcessCanvasLayout | null,
  edges: EdgeDraft[] = []
): { nodeLayout: NodeLayoutMap; edgeLabelLayout: EdgeLabelLayoutMap } {
  const nodeLayout: NodeLayoutMap = {};
  const edgeLabelLayout: EdgeLabelLayoutMap = {};
  if (!layout) return { nodeLayout, edgeLabelLayout };

  stages.forEach((stage, index) => {
    const point = layout.nodes[index];
    if (point) nodeLayout[stage.id] = point;
  });

  const indexedLabels = normalizeEdgeLabels(layout.edge_labels);
  if (Object.keys(indexedLabels).length > 0) {
    for (const edge of edges) {
      const key = edgeLayoutIndexKey(stages, edge.sourceId, edge.targetId);
      const offset = indexedLabels[key];
      if (offset) edgeLabelLayout[flowEdgeId(edge.sourceId, edge.targetId)] = offset;
    }
    return { nodeLayout, edgeLabelLayout };
  }

  if (Array.isArray(layout.edge_labels)) {
    stages.slice(0, -1).forEach((stage, index) => {
      const offset = layout.edge_labels[index];
      if (offset && typeof offset === "object" && "x" in offset) {
        const target = stages[index + 1];
        if (target) edgeLabelLayout[flowEdgeId(stage.id, target.id)] = offset;
      }
    });
  }

  return { nodeLayout, edgeLabelLayout };
}

export function serializeProcessState(
  name: string,
  owner: string,
  stages: StageDraft[],
  edges: EdgeDraft[],
  nodeLayout: NodeLayoutMap = {},
  edgeLabelLayout: EdgeLabelLayoutMap = {}
): string {
  return JSON.stringify({
    name: normalizeProcessName(name),
    owner: owner.trim(),
    canvas_layout: layoutToIndexed(stages, nodeLayout, edgeLabelLayout, edges) ?? null,
    graph_edges: edgesToGraph(stages, edges),
    stages: stages.map((s, i) => ({
      name: normalizeStageName(s.name, i),
      position: i,
      owner: s.owner.trim(),
      typical_duration: s.typical_duration.trim(),
      capability_ids: [...s.capability_ids].sort(),
    })),
  });
}

export function normalizeProcessName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "Untitled process";
}

export function normalizeStageName(name: string, index: number): string {
  const trimmed = name.trim();
  return trimmed || `Stage ${index + 1}`;
}

export function processFromSnapshot(
  name: string,
  owner: string,
  stages: StageDraft[],
  edges: EdgeDraft[],
  nodeLayout: NodeLayoutMap = {},
  edgeLabelLayout: EdgeLabelLayoutMap = {}
): {
  name: string;
  owner?: string;
  status?: string;
  canvas_layout?: ProcessCanvasLayout | null;
  graph_edges: ProcessGraphEdge[];
  stages: Array<{
    name: string;
    position: number;
    owner?: string;
    typical_duration?: string;
    capability_ids: string[];
  }>;
} {
  return {
    name: normalizeProcessName(name),
    owner: owner.trim() || undefined,
    canvas_layout: layoutToIndexed(stages, nodeLayout, edgeLabelLayout, edges) ?? null,
    graph_edges: edgesToGraph(stages, edges),
    stages: stages.map((s, i) => ({
      name: normalizeStageName(s.name, i),
      position: i,
      owner: s.owner.trim() || undefined,
      typical_duration: s.typical_duration.trim() || undefined,
      capability_ids: s.capability_ids,
    })),
  };
}

export function canAutosave(name: string, stages: StageDraft[]): boolean {
  return name.trim().length > 0 || stages.length > 0;
}

export function canPublish(name: string, stages: StageDraft[]): boolean {
  return (
    name.trim().length > 0 &&
    stages.length > 0 &&
    stages.every((s) => s.name.trim().length > 0)
  );
}

export function hasCustomLayout(
  nodeLayout: NodeLayoutMap,
  edgeLabelLayout: EdgeLabelLayoutMap
): boolean {
  return Object.keys(nodeLayout).length > 0 || Object.keys(edgeLabelLayout).length > 0;
}

export function edgeExists(edges: EdgeDraft[], sourceId: string, targetId: string): boolean {
  return edges.some((e) => e.sourceId === sourceId && e.targetId === targetId);
}

export function removeEdgesForStage(edges: EdgeDraft[], stageId: string): EdgeDraft[] {
  return edges.filter((e) => e.sourceId !== stageId && e.targetId !== stageId);
}

export function defaultBranchPosition(
  sourceId: string,
  stages: StageDraft[],
  nodeLayout: NodeLayoutMap,
  edges: EdgeDraft[],
  startX = 80,
  stageGap = 260,
  y = 80
): CanvasPoint {
  const sourceIndex = stages.findIndex((s) => s.id === sourceId);
  const fallback = {
    x: startX + Math.max(sourceIndex, 0) * stageGap,
    y,
  };
  const sourcePos = nodeLayout[sourceId] ?? fallback;
  const branchCount = edges.filter((e) => e.sourceId === sourceId).length;
  return {
    x: sourcePos.x + stageGap * 0.45,
    y: sourcePos.y + 100 + branchCount * 90,
  };
}

export function newEdgeDraft(sourceId: string, targetId: string): EdgeDraft {
  return { sourceId, targetId };
}
