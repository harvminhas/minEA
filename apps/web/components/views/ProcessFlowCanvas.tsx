"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeDragHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { GitBranch, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  EdgeAnnotationPopover,
  EdgeTransitionLabels,
} from "@/components/views/EdgeAnnotationPopover";
import { normalizeStageName, hasCustomLayout as layoutIsCustom, flowEdgeId } from "@/lib/process-state";
import type { EdgeDraft, EdgeLabelLayoutMap, NodeLayoutMap, StageTransition } from "@/lib/process-state";

export type { StageTransition };
import { cn } from "@/lib/utils";

export interface StageDraft {
  id: string;
  name: string;
  position: number;
  owner: string;
  typical_duration: string;
  capability_ids: string[];
}

export interface SelectedEdge {
  sourceId: string;
  targetId: string;
  anchor: { x: number; y: number };
}

type NodePosition = { x: number; y: number };

interface AnnotatedEdgeData {
  transition?: StageTransition;
  selected?: boolean;
  labelOffset?: NodePosition;
  onLabelOffsetChange?: (offset: NodePosition) => void;
}

function DraggableEdgeLabels({
  transition,
  labelX,
  labelY,
  offset,
  onOffsetChange,
}: {
  transition?: StageTransition;
  labelX: number;
  labelY: number;
  offset: NodePosition;
  onOffsetChange?: (offset: NodePosition) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origin: NodePosition } | null>(null);

  const onMouseDown = (event: React.MouseEvent) => {
    if (!onOffsetChange) return;
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      onOffsetChange({
        x: dragRef.current.origin.x + ev.clientX - dragRef.current.startX,
        y: dragRef.current.origin.y + ev.clientY - dragRef.current.startY,
      });
    };

    const onMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      className={cn(
        "nodrag nopan",
        onOffsetChange && "pointer-events-auto cursor-grab active:cursor-grabbing"
      )}
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${labelX + offset.x}px,${labelY + offset.y}px)`,
      }}
      onMouseDown={onMouseDown}
    >
      <EdgeTransitionLabels transition={transition} />
    </div>
  );
}

function AnnotatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  interactionWidth = 24,
}: EdgeProps<AnnotatedEdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const transition = data?.transition;
  const hasLabels = !!(transition?.condition || transition?.trigger || transition?.handoff);
  const selected = data?.selected;
  const labelOffset = data?.labelOffset ?? { x: 0, y: 0 };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={{
          ...style,
          stroke: selected ? "#6366f1" : style?.stroke,
          strokeWidth: selected ? 2 : style?.strokeWidth,
        }}
      />
      {hasLabels && (
        <EdgeLabelRenderer>
          <DraggableEdgeLabels
            transition={transition}
            labelX={labelX}
            labelY={labelY}
            offset={labelOffset}
            onOffsetChange={data?.onLabelOffsetChange}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

interface StageNodeData {
  stage: StageDraft;
  index: number;
  selected: boolean;
  onRequestDelete: (id: string, name: string) => void;
  onRequestAddPath: (id: string) => void;
}

function StageNode({ data }: { data: StageNodeData }) {
  const { stage, index, selected, onRequestDelete, onRequestAddPath } = data;
  const label = stage.name.trim() || "Untitled stage";

  return (
    <div
      className={cn(
        "group relative cursor-grab active:cursor-grabbing text-left rounded-xl border bg-white shadow-sm px-4 py-3 min-w-[180px] max-w-[200px] transition-[border-color,box-shadow]",
        selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-gray-200 hover:border-indigo-200"
      )}
    >
      <button
        type="button"
        title="Remove stage"
        aria-label={`Remove ${label}`}
        className={cn(
          "nodrag nopan absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50",
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete(stage.id, label);
        }}
      >
        <Trash2 size={13} />
      </button>

      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-2 !h-2 !border-0" />
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 pr-6">
        Stage {index + 1}
      </p>
      <p className="text-sm font-semibold text-gray-900 truncate">{label}</p>
      <p className="text-xs text-gray-400 mt-1">
        {stage.capability_ids.length} capabilit
        {stage.capability_ids.length === 1 ? "y" : "ies"}
        {stage.typical_duration && <> · {stage.typical_duration}</>}
      </p>
      <div className="flex items-center mt-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          title="Add another path"
          aria-label={`Add path from ${label}`}
          className="nodrag nopan p-1 rounded-md text-gray-400 hover:text-amber-700 hover:bg-amber-50 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onRequestAddPath(stage.id);
          }}
        >
          <GitBranch size={12} />
        </button>
      </div>
    </div>
  );
}

function AddStageNode() {
  return (
    <div className="nodrag nopan cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-white/50 hover:border-indigo-300 hover:bg-indigo-50/30 px-6 py-5 min-w-[180px] text-center transition-colors">
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Plus size={18} className="mx-auto text-gray-400 mb-1" />
      <p className="text-xs font-medium text-gray-500">Add stage</p>
      <p className="text-[10px] text-gray-400 mt-0.5">or press Tab</p>
    </div>
  );
}

const nodeTypes = { stageNode: StageNode, addStageNode: AddStageNode };
const edgeTypes = { annotated: AnnotatedEdge };

const STAGE_GAP = 260;
const START_X = 80;
const Y = 80;

function defaultNodePositions(stages: StageDraft[]): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};
  stages.forEach((stage, index) => {
    positions[stage.id] = { x: START_X + index * STAGE_GAP, y: Y };
  });
  positions["add-stage"] = { x: START_X + stages.length * STAGE_GAP, y: Y + 4 };
  return positions;
}

function buildFlow(
  stages: StageDraft[],
  graphEdges: EdgeDraft[],
  selectedStageId: string | null,
  selectedEdge: SelectedEdge | null,
  onRequestDelete: (id: string, name: string) => void,
  onRequestAddPath: (id: string) => void,
  positions: Record<string, NodePosition>,
  edgeLabelOffsets: Record<string, NodePosition>,
  onLabelOffsetChange: (edgeId: string, offset: NodePosition) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = stages.map((stage, index) => ({
    id: stage.id,
    type: "stageNode",
    position: positions[stage.id] ?? { x: START_X + index * STAGE_GAP, y: Y },
    data: {
      stage,
      index,
      selected: stage.id === selectedStageId,
      onRequestDelete,
      onRequestAddPath,
    },
    draggable: true,
    selectable: true,
  }));

  nodes.push({
    id: "add-stage",
    type: "addStageNode",
    position: positions["add-stage"] ?? {
      x: START_X + stages.length * STAGE_GAP,
      y: Y + 4,
    },
    data: {},
    draggable: false,
    selectable: true,
  });

  const edges: Edge[] = graphEdges.map((edge) => {
    const edgeId = flowEdgeId(edge.sourceId, edge.targetId);
    return {
      id: edgeId,
      source: edge.sourceId,
      target: edge.targetId,
      type: "annotated",
      selectable: true,
      interactionWidth: 24,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#94a3b8" },
      style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
      data: {
        transition: edge.transition,
        selected:
          selectedEdge?.sourceId === edge.sourceId && selectedEdge?.targetId === edge.targetId,
        labelOffset: edgeLabelOffsets[edgeId],
        onLabelOffsetChange: (offset: NodePosition) => onLabelOffsetChange(edgeId, offset),
      },
    };
  });

  if (stages.length > 0) {
    edges.push({
      id: `e-${stages[stages.length - 1]!.id}-add`,
      source: stages[stages.length - 1]!.id,
      target: "add-stage",
      type: "smoothstep",
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#cbd5e1" },
      style: { stroke: "#e2e8f0", strokeWidth: 1, strokeDasharray: "4 4" },
    });
  }

  return { nodes, edges };
}

function FitViewOnFirstStage({ stageCount }: { stageCount: number }) {
  const { fitView } = useReactFlow();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (stageCount === 0) {
      hasFittedRef.current = false;
      return;
    }
    if (!hasFittedRef.current) {
      hasFittedRef.current = true;
      fitView({ padding: 0.3, duration: 150 });
    }
  }, [stageCount, fitView]);

  return null;
}

function FitViewOnLayoutReset({ resetToken }: { resetToken: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (resetToken === 0) return;
    fitView({ padding: 0.3, duration: 200 });
  }, [resetToken, fitView]);
  return null;
}

interface Props {
  stages: StageDraft[];
  graphEdges: EdgeDraft[];
  nodeLayout: NodeLayoutMap;
  edgeLabelLayout: EdgeLabelLayoutMap;
  selectedStageId: string | null;
  selectedEdge: SelectedEdge | null;
  onSelectStage: (id: string) => void;
  onSelectEdge: (edge: SelectedEdge | null) => void;
  onUpdateEdgeTransition: (
    sourceId: string,
    targetId: string,
    transition: StageTransition
  ) => void;
  onLayoutChange: (nodeLayout: NodeLayoutMap, edgeLabelLayout: EdgeLabelLayoutMap) => void;
  onResetLayout: () => void;
  onAddStage: () => void;
  onRequestAddPath: (sourceStageId: string) => void;
  onRequestDeleteStage: (id: string, name: string) => void;
}

export function ProcessFlowCanvas({
  stages,
  graphEdges,
  nodeLayout,
  edgeLabelLayout,
  selectedStageId,
  selectedEdge,
  onSelectStage,
  onSelectEdge,
  onUpdateEdgeTransition,
  onLayoutChange,
  onResetLayout,
  onAddStage,
  onRequestAddPath,
  onRequestDeleteStage,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef(onRequestDeleteStage);
  deleteRef.current = onRequestDeleteStage;
  const addPathRef = useRef(onRequestAddPath);
  addPathRef.current = onRequestAddPath;
  const nodeLayoutRef = useRef(nodeLayout);
  nodeLayoutRef.current = nodeLayout;
  const edgeLabelLayoutRef = useRef(edgeLabelLayout);
  edgeLabelLayoutRef.current = edgeLabelLayout;

  const [layoutResetToken, setLayoutResetToken] = useState(0);

  const stableDelete = useCallback((id: string, name: string) => {
    deleteRef.current(id, name);
  }, []);

  const stableAddPath = useCallback((id: string) => {
    addPathRef.current(id);
  }, []);

  const onLabelOffsetChange = useCallback(
    (edgeId: string, offset: NodePosition) => {
      onLayoutChange(nodeLayoutRef.current, {
        ...edgeLabelLayoutRef.current,
        [edgeId]: offset,
      });
    },
    [onLayoutChange]
  );

  const defaultPositions = useMemo(() => defaultNodePositions(stages), [stages]);

  const resolvedPositions = useMemo(() => {
    const merged = { ...defaultPositions };
    for (const [id, pos] of Object.entries(nodeLayout)) {
      if (merged[id] || stages.some((s) => s.id === id)) {
        merged[id] = pos;
      }
    }
    return merged;
  }, [defaultPositions, nodeLayout, stages]);

  const hasCustomLayout = layoutIsCustom(nodeLayout, edgeLabelLayout);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      buildFlow(
        stages,
        graphEdges,
        selectedStageId,
        selectedEdge,
        stableDelete,
        stableAddPath,
        resolvedPositions,
        edgeLabelLayout,
        onLabelOffsetChange
      ),
    [
      stages,
      graphEdges,
      selectedStageId,
      selectedEdge,
      stableDelete,
      stableAddPath,
      resolvedPositions,
      edgeLabelLayout,
      onLabelOffsetChange,
    ]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const persistNodePosition = useCallback(
    (nodeId: string, position: NodePosition) => {
      if (nodeId === "add-stage") return;
      const current = nodeLayoutRef.current[nodeId];
      if (current?.x === position.x && current?.y === position.y) return;
      onLayoutChange({ ...nodeLayoutRef.current, [nodeId]: position }, edgeLabelLayoutRef.current);
    },
    [onLayoutChange]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === "position" && change.dragging === false && change.position) {
          persistNodePosition(change.id, change.position);
        }
      }
    },
    [onNodesChange, persistNodePosition]
  );

  useEffect(() => {
    const { nodes: nextNodes, edges: nextEdges } = buildFlow(
      stages,
      graphEdges,
      selectedStageId,
      selectedEdge,
      stableDelete,
      stableAddPath,
      resolvedPositions,
      edgeLabelLayout,
      onLabelOffsetChange
    );
    setNodes((prev) =>
      nextNodes.map((node) => {
        const prevNode = prev.find((n) => n.id === node.id);
        if (prevNode?.dragging) {
          return { ...node, position: prevNode.position };
        }
        const saved = nodeLayoutRef.current[node.id];
        if (saved && node.type === "stageNode") {
          return { ...node, position: saved };
        }
        return node;
      })
    );
    setEdges(nextEdges);
  }, [
    stages,
    graphEdges,
    selectedStageId,
    selectedEdge,
    stableDelete,
    stableAddPath,
    resolvedPositions,
    edgeLabelLayout,
    onLabelOffsetChange,
    setNodes,
    setEdges,
  ]);

  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      if (!node?.id || node.type !== "stageNode") return;
      persistNodePosition(node.id, node.position);
    },
    [persistNodePosition]
  );

  const resetLayout = useCallback(() => {
    onResetLayout();
    setLayoutResetToken((token) => token + 1);
  }, [onResetLayout]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "addStageNode") {
        onAddStage();
      } else if (node.type === "stageNode") {
        onSelectStage(node.id);
      }
    },
    [onAddStage, onSelectStage]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (edge.target === "add-stage" || edge.type !== "annotated") return;

      const rect = canvasRef.current?.getBoundingClientRect();
      const x = rect ? event.clientX - rect.left + 12 : event.clientX;
      const y = rect ? event.clientY - rect.top + 12 : event.clientY;

      onSelectEdge({
        sourceId: edge.source,
        targetId: edge.target,
        anchor: { x, y },
      });
    },
    [onSelectEdge]
  );

  const onPaneClick = useCallback(() => {
    onSelectEdge(null);
  }, [onSelectEdge]);

  const sourceStage = selectedEdge
    ? stages.find((s) => s.id === selectedEdge.sourceId)
    : null;
  const targetStage = selectedEdge
    ? stages.find((s) => s.id === selectedEdge.targetId)
    : null;

  const sourceIndex = sourceStage ? stages.indexOf(sourceStage) : -1;
  const targetIndex = targetStage ? stages.indexOf(targetStage) : -1;

  const selectedEdgeTransition =
    selectedEdge &&
    graphEdges.find(
      (e) => e.sourceId === selectedEdge.sourceId && e.targetId === selectedEdge.targetId
    )?.transition;

  return (
    <div ref={canvasRef} className="h-full w-full bg-[#fafafa] relative">
      <button
        type="button"
        onClick={resetLayout}
        disabled={!hasCustomLayout}
        title="Restore default stage positions and edge labels"
        className={cn(
          "absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors",
          hasCustomLayout
            ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
        )}
      >
        <RotateCcw size={13} />
        Reset layout
      </button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable
        elementsSelectable
        panOnScroll
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnFirstStage stageCount={stages.length} />
        <FitViewOnLayoutReset resetToken={layoutResetToken} />
        <Background gap={20} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-sm" />
      </ReactFlow>

      {selectedEdge && sourceStage && targetStage && sourceIndex >= 0 && targetIndex >= 0 && (
        <EdgeAnnotationPopover
          sourceName={normalizeStageName(sourceStage.name, sourceIndex)}
          targetName={normalizeStageName(targetStage.name, targetIndex)}
          transition={selectedEdgeTransition ?? {}}
          anchor={selectedEdge.anchor}
          onChange={(transition) =>
            onUpdateEdgeTransition(selectedEdge.sourceId, selectedEdge.targetId, transition)
          }
          onClose={() => onSelectEdge(null)}
        />
      )}
    </div>
  );
}

export function newStageDraft(position: number): StageDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    position,
    owner: "",
    typical_duration: "",
    capability_ids: [],
  };
}
