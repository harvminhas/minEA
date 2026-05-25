import type { StepDraft } from "@/components/views/JourneyFlowCanvas";
import type { CanvasPoint, Journey, JourneyGraphEdge, ProcessCanvasLayout } from "@minea/types";

export type NodeLayoutMap = Record<string, CanvasPoint>;
export type EdgeLabelLayoutMap = Record<string, CanvasPoint>;

export interface JourneyEdgeTransition {
  transition_description?: string;
  time_wait?: string;
  channel_switch?: string;
  dependency?: string;
  entry_criteria?: string;
}

export interface EdgeDraft {
  sourceId: string;
  targetId: string;
  transition?: JourneyEdgeTransition;
}

export function flowEdgeId(sourceId: string, targetId: string): string {
  return `e-${sourceId}-${targetId}`;
}

export function edgeLayoutIndexKey(stages: StepDraft[], sourceId: string, targetId: string): string {
  const sourceIndex = stages.findIndex((s) => s.id === sourceId);
  const targetIndex = stages.findIndex((s) => s.id === targetId);
  return `${sourceIndex}:${targetIndex}`;
}

export function normalizeEdgeTransition(t?: JourneyEdgeTransition): JourneyEdgeTransition | undefined {
  if (!t) return undefined;
  const transition_description = t.transition_description?.trim() || undefined;
  const time_wait = t.time_wait?.trim() || undefined;
  const channel_switch = t.channel_switch?.trim() || undefined;
  const dependency = t.dependency?.trim() || undefined;
  const entry_criteria = t.entry_criteria?.trim() || undefined;
  if (!transition_description && !time_wait && !channel_switch && !dependency && !entry_criteria) {
    return undefined;
  }
  return { transition_description, time_wait, channel_switch, dependency, entry_criteria };
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
  return {
    nodes: layout.nodes.map((point) => (point ? roundPoint(point) : null)),
    edge_labels: normalizeEdgeLabels(layout.edge_labels),
  };
}

export function buildLinearEdges(steps: StepDraft[]): EdgeDraft[] {
  const edges: EdgeDraft[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({ sourceId: steps[i]!.id, targetId: steps[i + 1]!.id });
  }
  return edges;
}

export function edgesFromJourney(journey?: Journey | null, steps: StepDraft[] = []): EdgeDraft[] {
  if (!steps.length) return [];

  if (journey?.graph_edges?.length) {
    return journey.graph_edges.flatMap((edge) => {
      const source = steps[edge.source_index];
      const target = steps[edge.target_index];
      if (!source || !target) return [];
      return [
        {
          sourceId: source.id,
          targetId: target.id,
          transition: normalizeEdgeTransition({
            transition_description: edge.transition_description ?? undefined,
            time_wait: edge.time_wait ?? undefined,
            channel_switch: edge.channel_switch ?? undefined,
            dependency: edge.dependency ?? undefined,
            entry_criteria: edge.entry_criteria ?? undefined,
          }),
        },
      ];
    });
  }

  return buildLinearEdges(steps);
}

export function edgesToGraph(steps: StepDraft[], edges: EdgeDraft[]): JourneyGraphEdge[] {
  return edges
    .map((edge) => {
      const transition = normalizeEdgeTransition(edge.transition);
      return {
        source_index: steps.findIndex((s) => s.id === edge.sourceId),
        target_index: steps.findIndex((s) => s.id === edge.targetId),
        transition_description: transition?.transition_description ?? null,
        time_wait: transition?.time_wait ?? null,
        channel_switch: transition?.channel_switch ?? null,
        dependency: transition?.dependency ?? null,
        entry_criteria: transition?.entry_criteria ?? null,
      };
    })
    .filter((edge) => edge.source_index >= 0 && edge.target_index >= 0);
}

export function layoutToIndexed(
  steps: StepDraft[],
  nodeLayout: NodeLayoutMap,
  edgeLabelLayout: EdgeLabelLayoutMap,
  edges: EdgeDraft[]
): ProcessCanvasLayout | undefined {
  const nodes = steps.map((step) => nodeLayout[step.id] ?? null);
  const edge_labels: Record<string, CanvasPoint> = {};
  for (const edge of edges) {
    const layoutKey = flowEdgeId(edge.sourceId, edge.targetId);
    const offset = edgeLabelLayout[layoutKey];
    if (offset) {
      edge_labels[edgeLayoutIndexKey(steps, edge.sourceId, edge.targetId)] = roundPoint(offset);
    }
  }
  const hasCustom = nodes.some(Boolean) || Object.keys(edge_labels).length > 0;
  if (!hasCustom) return undefined;
  return { nodes, edge_labels };
}

export function layoutFromIndexed(
  steps: StepDraft[],
  layout?: ProcessCanvasLayout | null,
  edges: EdgeDraft[] = []
): { nodeLayout: NodeLayoutMap; edgeLabelLayout: EdgeLabelLayoutMap } {
  const nodeLayout: NodeLayoutMap = {};
  const edgeLabelLayout: EdgeLabelLayoutMap = {};
  if (!layout) return { nodeLayout, edgeLabelLayout };

  steps.forEach((step, index) => {
    const point = layout.nodes[index];
    if (point) nodeLayout[step.id] = point;
  });

  const indexedLabels = normalizeEdgeLabels(layout.edge_labels);
  for (const edge of edges) {
    const key = edgeLayoutIndexKey(steps, edge.sourceId, edge.targetId);
    const offset = indexedLabels[key];
    if (offset) edgeLabelLayout[flowEdgeId(edge.sourceId, edge.targetId)] = offset;
  }
  return { nodeLayout, edgeLabelLayout };
}

export function serializeJourneyState(
  name: string,
  owner: string,
  customerSegment: string,
  steps: StepDraft[],
  edges: EdgeDraft[],
  nodeLayout: NodeLayoutMap = {},
  edgeLabelLayout: EdgeLabelLayoutMap = {}
): string {
  return JSON.stringify({
    name: normalizeJourneyName(name),
    owner: owner.trim(),
    customer_segment: customerSegment.trim(),
    canvas_layout: layoutToIndexed(steps, nodeLayout, edgeLabelLayout, edges) ?? null,
    graph_edges: edgesToGraph(steps, edges),
    steps: steps.map((s, i) => ({
      title: normalizeStepTitle(s.title, i),
      position: i,
      channel: s.channel.trim(),
      goal: s.goal.trim(),
      pain_points: s.pain_points.trim(),
      owner: s.owner.trim(),
      ai_opportunities: s.ai_opportunities.trim(),
      sentiment_friction: s.sentiment_friction.trim(),
      process_ids: [...s.process_ids].sort(),
      system_ids: [...s.system_ids].sort(),
    })),
  });
}

export function normalizeJourneyName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "Untitled journey";
}

export function normalizeStepTitle(title: string, index: number): string {
  const trimmed = title.trim();
  return trimmed || `Step ${index + 1}`;
}

export function journeyFromSnapshot(
  name: string,
  owner: string,
  customerSegment: string,
  steps: StepDraft[],
  edges: EdgeDraft[],
  nodeLayout: NodeLayoutMap = {},
  edgeLabelLayout: EdgeLabelLayoutMap = {}
) {
  return {
    name: normalizeJourneyName(name),
    owner: owner.trim() || undefined,
    customer_segment: customerSegment.trim() || undefined,
    canvas_layout: layoutToIndexed(steps, nodeLayout, edgeLabelLayout, edges) ?? null,
    graph_edges: edgesToGraph(steps, edges),
    steps: steps.map((s, i) => ({
      title: normalizeStepTitle(s.title, i),
      position: i,
      channel: s.channel.trim() || undefined,
      goal: s.goal.trim() || undefined,
      pain_points: s.pain_points.trim() || undefined,
      owner: s.owner.trim() || undefined,
      ai_opportunities: s.ai_opportunities.trim() || undefined,
      sentiment_friction: s.sentiment_friction.trim() || undefined,
      process_ids: s.process_ids,
      system_ids: s.system_ids,
    })),
  };
}

export function canAutosave(name: string, steps: StepDraft[]): boolean {
  return name.trim().length > 0 || steps.length > 0;
}

export function canPublish(name: string, steps: StepDraft[]): boolean {
  return name.trim().length > 0 && steps.length > 0 && steps.every((s) => s.title.trim().length > 0);
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

export function removeEdgesForStep(edges: EdgeDraft[], stepId: string): EdgeDraft[] {
  return edges.filter((e) => e.sourceId !== stepId && e.targetId !== stepId);
}

export function defaultBranchPosition(
  sourceId: string,
  steps: StepDraft[],
  nodeLayout: NodeLayoutMap,
  edges: EdgeDraft[],
  startX = 80,
  stageGap = 260,
  y = 80
): CanvasPoint {
  const sourceIndex = steps.findIndex((s) => s.id === sourceId);
  const fallback = { x: startX + Math.max(sourceIndex, 0) * stageGap, y };
  const sourcePos = nodeLayout[sourceId] ?? fallback;
  const branchCount = edges.filter((e) => e.sourceId === sourceId).length;
  return { x: sourcePos.x + stageGap * 0.45, y: sourcePos.y + 100 + branchCount * 90 };
}

export function newEdgeDraft(sourceId: string, targetId: string): EdgeDraft {
  return { sourceId, targetId };
}

export function stepsFromJourney(journey?: Journey | null): StepDraft[] {
  if (!journey?.steps.length) return [];
  return journey.steps.map((s) => ({
    id: s.id,
    title: s.title,
    position: s.position,
    channel: s.channel ?? "",
    goal: s.goal ?? "",
    pain_points: s.pain_points ?? "",
    owner: s.owner ?? "",
    ai_opportunities: s.ai_opportunities ?? "",
    sentiment_friction: s.sentiment_friction ?? "",
    process_ids: s.process_ids ?? [],
    system_ids: s.system_ids ?? [],
  }));
}

export function newStepDraft(position: number): StepDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    position,
    channel: "",
    goal: "",
    pain_points: "",
    owner: "",
    ai_opportunities: "",
    sentiment_friction: "",
    process_ids: [],
    system_ids: [],
  };
}
