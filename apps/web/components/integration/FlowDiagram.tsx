"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeDragHandler,
  type NodeProps,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { Layers, Monitor, Plus, RotateCcw, X } from "lucide-react";
import { AddFlowEndpointDialog } from "@/components/integration/AddFlowEndpointDialog";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { DiagramExportButton } from "@/components/shared/DiagramExportButton";
import { toast } from "@/hooks/use-toast";
import type { FlowArchitectureUpdate } from "@/lib/flow-relationship-utils";
import { flowConnectorEdgeStyle, flowHasV2Endpoints, flowUsesDashedConnector, formatFlowEndpointLabel } from "@/lib/flow-utils";
import { cn } from "@/lib/utils";
import type { FlowEndpointSide, IntegrationFlowProperties, MinEAObject } from "@minea/types";

export type NodeLayout = Record<string, { x: number; y: number }>;

// ─── Label maps ───────────────────────────────────────────────────────────────

const PROTOCOL_LABEL: Record<string, string> = {
  rest_api: "REST API",
  graphql: "GraphQL",
  grpc: "gRPC",
  jdbc: "JDBC",
  file: "File",
};
const FREQ_LABEL: Record<string, string> = {
  realtime: "Real-time",
  batch: "Batch",
  scheduled: "Scheduled",
  event_driven: "Event-driven",
};
const AUTH_LABEL: Record<string, string> = {
  oauth2: "OAuth 2.0",
  api_key: "API key",
  basic: "Basic auth",
  mutual_tls: "mTLS",
  none: "No auth",
};
const CRITICALITY_COLOR: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-100",
  high: "bg-orange-50 text-orange-700 border-orange-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

// ─── Custom React Flow node types ─────────────────────────────────────────────

const SystemNode = memo(({ data }: NodeProps) => (
  <div className="bg-white border-2 border-teal-300 rounded-lg shadow-sm" style={{ minWidth: 160 }}>
    {data.side === "source" && (
      <Handle type="source" position={Position.Right} style={{ background: "#14b8a6" }} />
    )}
    {data.side === "dest" && (
      <Handle type="target" position={Position.Left} style={{ background: "#14b8a6" }} />
    )}
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-5 w-5 rounded bg-teal-50 flex items-center justify-center flex-shrink-0">
          <Monitor size={11} className="text-teal-600" />
        </div>
        <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{data.name}</p>
      </div>
      <p className="text-[9px] text-teal-600 font-medium pl-7">All entities · wildcard</p>
    </div>
  </div>
));
SystemNode.displayName = "SystemNode";

const EntityNode = memo(({ data }: NodeProps) => (
  <div className="bg-gray-50 border border-gray-300 rounded-md shadow-sm px-3 py-2" style={{ minWidth: 140 }}>
    {data.side === "source" && <Handle type="source" position={Position.Right} />}
    {data.side === "dest" && <Handle type="target" position={Position.Left} />}
    <div className="flex items-center gap-1.5">
      <Layers size={10} className="text-gray-400 flex-shrink-0" />
      <p className="text-xs font-medium text-gray-800 truncate">{data.name}</p>
    </div>
    {data.systemName && (
      <p className="text-[9px] text-gray-400 pl-4 truncate">{data.systemName}</p>
    )}
  </div>
));
EntityNode.displayName = "EntityNode";

const FlowCenterNode = memo(({ data }: NodeProps) => {
  const { flow, props } = data as { flow: MinEAObject; props: IntegrationFlowProperties };
  const cls = props.data_classification ?? "";
  const clsColor =
    cls === "restricted" || cls === "pii"
      ? "bg-red-50 text-red-700 border-red-100"
      : cls === "confidential"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div className="bg-white rounded-xl shadow-xl border-2 border-gray-800 overflow-hidden" style={{ width: 230 }}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="h-1 bg-teal-500" />
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-sm font-bold text-gray-900 leading-tight">{flow.name}</p>
        {(props.protocol || props.format) && (
          <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-100 rounded-md px-2.5 py-1.5">
            <span className="text-[10px] font-semibold text-teal-700">
              {PROTOCOL_LABEL[props.protocol ?? ""] ?? props.protocol ?? ""}
            </span>
            {props.format && (
              <>
                <span className="text-teal-300 text-[10px]">·</span>
                <span className="text-[10px] text-teal-600 uppercase">{props.format}</span>
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {props.frequency && (
            <div className="bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
              <p className="text-[8px] text-gray-400 uppercase tracking-wide">Frequency</p>
              <p className="text-[10px] font-medium text-gray-700 mt-0.5">
                {FREQ_LABEL[props.frequency] ?? props.frequency}
              </p>
            </div>
          )}
          {props.auth && (
            <div className="bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
              <p className="text-[8px] text-gray-400 uppercase tracking-wide">Auth</p>
              <p className="text-[10px] font-medium text-gray-700 mt-0.5">
                {AUTH_LABEL[props.auth] ?? props.auth}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {props.direction && (
            <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-full font-medium capitalize">
              {props.direction.replace(/_/g, " ")}
            </span>
          )}
          {props.criticality && (
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize border",
              CRITICALITY_COLOR[props.criticality] ?? "bg-gray-100 text-gray-600 border-gray-200"
            )}>
              {props.criticality}
            </span>
          )}
          {cls && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize border", clsColor)}>
              {cls}
            </span>
          )}
        </div>
        {flow.owner && (
          <p className="text-[9px] text-gray-400 border-t border-gray-100 pt-1.5 truncate">
            Owner: {flow.owner}
          </p>
        )}
      </div>
    </div>
  );
});
FlowCenterNode.displayName = "FlowCenterNode";

// Stable reference — defined outside any component so React Flow never remounts nodes
export const FLOW_NODE_TYPES: NodeTypes = {
  systemNode: SystemNode,
  entityNode: EntityNode,
  flowCenterNode: FlowCenterNode,
};

// ─── Graph builder ────────────────────────────────────────────────────────────

export function buildFlowGraph(
  flow: MinEAObject,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  if (flowHasV2Endpoints(props) && props.from && props.to) {
    return buildFlowGraphV2(flow, props, savedLayout);
  }

  const srcs = props.sources ?? { systems: [], entities: [] };
  const dsts = props.destinations ?? { systems: [], entities: [] };

  type Item = { id: string; label: string; nodeType: string; side: "source" | "dest"; systemName?: string };

  const srcItems: Item[] = [
    ...srcs.systems.map((s) => ({ id: `src-sys-${s.system_id}`, label: s.system_name, nodeType: "systemNode", side: "source" as const })),
    ...srcs.entities.map((e) => ({ id: `src-ent-${e.entity_id}`, label: e.entity_name, nodeType: "entityNode", side: "source" as const, systemName: e.system_name ?? undefined })),
  ];
  const dstItems: Item[] = [
    ...dsts.systems.map((s) => ({ id: `dst-sys-${s.system_id}`, label: s.system_name, nodeType: "systemNode", side: "dest" as const })),
    ...dsts.entities.map((e) => ({ id: `dst-ent-${e.entity_id}`, label: e.entity_name, nodeType: "entityNode", side: "dest" as const, systemName: e.system_name ?? undefined })),
  ];

  const NODE_H = 72, GAP = 24, CENTER_X = 320, DST_X = CENTER_X + 270;

  function autoPositions(count: number, x: number) {
    const total = Math.max(count, 1) * NODE_H + Math.max(count - 1, 0) * GAP;
    const start = -total / 2;
    return Array.from({ length: Math.max(count, 1) }, (_, i) => ({ x, y: start + i * (NODE_H + GAP) }));
  }

  function pos(id: string, auto: { x: number; y: number }) {
    return savedLayout?.[id] ?? auto;
  }

  const srcPos = autoPositions(srcItems.length, 0);
  const dstPos = autoPositions(dstItems.length, DST_X);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeStyle = flowConnectorEdgeStyle(props.mechanism);
  const marker = { type: MarkerType.ArrowClosed, color: "#14b8a6", width: 14, height: 14 };

  if (srcItems.length === 0) {
    nodes.push({ id: "src-placeholder", type: "default", position: pos("src-placeholder", srcPos[0]!), data: { label: "No sources" }, style: { opacity: 0.4, fontSize: 11, width: 160 } });
  } else {
    srcItems.forEach((item, i) => {
      nodes.push({ id: item.id, type: item.nodeType, position: pos(item.id, srcPos[i]!), data: { name: item.label, side: "source", systemName: item.systemName } });
      edges.push({ id: `e-${item.id}`, source: item.id, target: "flow-center", type: "smoothstep", animated: true, style: edgeStyle, markerEnd: marker });
    });
  }

  nodes.push({ id: "flow-center", type: "flowCenterNode", position: pos("flow-center", { x: CENTER_X, y: -60 }), data: { flow, props } });

  if (dstItems.length === 0) {
    nodes.push({ id: "dst-placeholder", type: "default", position: pos("dst-placeholder", dstPos[0]!), data: { label: "No destinations" }, style: { opacity: 0.4, fontSize: 11, width: 160 } });
  } else {
    dstItems.forEach((item, i) => {
      nodes.push({ id: item.id, type: item.nodeType, position: pos(item.id, dstPos[i]!), data: { name: item.label, side: "dest", systemName: item.systemName } });
      edges.push({ id: `e-${item.id}`, source: "flow-center", target: item.id, type: "smoothstep", animated: true, style: edgeStyle, markerEnd: marker });
    });
  }

  return { nodes, edges };
}

function buildFlowGraphV2(
  flow: MinEAObject,
  props: IntegrationFlowProperties,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const from = props.from!;
  const to = props.to!;
  const edgeStyle = flowConnectorEdgeStyle(props.mechanism);
  const marker = { type: MarkerType.ArrowClosed, color: "#14b8a6", width: 14, height: 14 };

  function pos(id: string, auto: { x: number; y: number }) {
    return savedLayout?.[id] ?? auto;
  }

  const fromId = `from-${from.endpoint_id}`;
  const toId = `to-${to.endpoint_id}`;
  const fromNodeType =
    from.endpoint_kind === "data_object"
      ? "entityNode"
      : from.endpoint_kind === "component"
        ? "entityNode"
        : "systemNode";
  const toNodeType =
    to.endpoint_kind === "data_object"
      ? "entityNode"
      : to.endpoint_kind === "component"
        ? "entityNode"
        : "systemNode";

  const nodes: Node[] = [
    {
      id: fromId,
      type: fromNodeType,
      position: pos(fromId, { x: 0, y: -20 }),
      data: {
        name: formatFlowEndpointLabel(from),
        side: "source",
        systemName: from.context_label,
      },
    },
    {
      id: "flow-center",
      type: "flowCenterNode",
      position: pos("flow-center", { x: 320, y: -60 }),
      data: { flow, props },
    },
    {
      id: toId,
      type: toNodeType,
      position: pos(toId, { x: 590, y: -20 }),
      data: {
        name: formatFlowEndpointLabel(to),
        side: "dest",
        systemName: to.context_label,
      },
    },
  ];

  const edges: Edge[] = [
    {
      id: `e-${fromId}`,
      source: fromId,
      target: "flow-center",
      type: "smoothstep",
      animated: !flowUsesDashedConnector(props.mechanism),
      style: edgeStyle,
      markerEnd: marker,
    },
    {
      id: `e-${toId}`,
      source: "flow-center",
      target: toId,
      type: "smoothstep",
      animated: !flowUsesDashedConnector(props.mechanism),
      style: edgeStyle,
      markerEnd: marker,
    },
  ];

  return { nodes, edges };
}

// ─── Thumbnail (lightweight SVG — one per list card) ──────────────────────────

export function FlowDiagramThumbnail({ flow }: { flow: MinEAObject }) {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const srcs = [
    ...(props.sources?.systems ?? []).map((s) => ({ label: s.system_name, isSystem: true })),
    ...(props.sources?.entities ?? []).map((e) => ({ label: e.entity_name, isSystem: false })),
  ];
  const dsts = [
    ...(props.destinations?.systems ?? []).map((s) => ({ label: s.system_name, isSystem: true })),
    ...(props.destinations?.entities ?? []).map((e) => ({ label: e.entity_name, isSystem: false })),
  ];

  const MAX = 3;
  const srcShow = srcs.slice(0, MAX);
  const dstShow = dsts.slice(0, MAX);
  const srcMore = Math.max(0, srcs.length - MAX);
  const dstMore = Math.max(0, dsts.length - MAX);
  const srcRows = srcShow.length + (srcMore > 0 ? 1 : 0);
  const dstRows = dstShow.length + (dstMore > 0 ? 1 : 0);

  const W = 300, H = 100, BW = 76, BH = 20, GAP = 5;
  const SRC_X = 4, DST_X = W - BW - 4;
  const CX = W / 2 - 34, CW = 68, CH = 32, CY = H / 2 - CH / 2;

  function getBoxY(idx: number, total: number) {
    const th = total * BH + Math.max(total - 1, 0) * GAP;
    return H / 2 - th / 2 + idx * (BH + GAP);
  }
  function midY(idx: number, total: number) { return getBoxY(idx, total) + BH / 2; }

  const cMidY = CY + CH / 2;
  const protocol = PROTOCOL_LABEL[props.protocol ?? ""] ?? props.protocol ?? "FLOW";
  const freq = FREQ_LABEL[props.frequency ?? ""] ?? (props.frequency ?? "");

  if (srcs.length === 0 && dsts.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
        <p className="text-[10px] text-gray-400 italic">No endpoints configured</p>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" height={88} aria-hidden="true">
      <defs>
        <marker id={`arr-${flow.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#14b8a6" />
        </marker>
      </defs>
      {srcShow.map((item, i) => {
        const by = getBoxY(i, srcRows), my = midY(i, srcRows);
        return (
          <g key={`s${i}`}>
            <rect x={SRC_X} y={by} width={BW} height={BH} rx={3} fill={item.isSystem ? "#f0fdfa" : "#f9fafb"} stroke={item.isSystem ? "#5eead4" : "#d1d5db"} strokeWidth={item.isSystem ? 1.5 : 1} />
            <text x={SRC_X + 5} y={by + BH / 2} fontSize="7" fill="#374151" dominantBaseline="middle">{item.label.length > 11 ? item.label.slice(0, 10) + "…" : item.label}</text>
            <path d={`M${SRC_X + BW} ${my} C${CX - 18} ${my} ${CX - 18} ${cMidY} ${CX} ${cMidY}`} fill="none" stroke="#5eead4" strokeWidth={1} />
          </g>
        );
      })}
      {srcMore > 0 && (() => {
        const by = getBoxY(srcShow.length, srcRows), my = midY(srcShow.length, srcRows);
        return (
          <g key="src-more">
            <rect x={SRC_X} y={by} width={BW} height={BH} rx={3} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 2" />
            <text x={SRC_X + BW / 2} y={by + BH / 2} fontSize="7" fill="#9ca3af" textAnchor="middle" dominantBaseline="middle">+{srcMore} more</text>
            <path d={`M${SRC_X + BW} ${my} C${CX - 18} ${my} ${CX - 18} ${cMidY} ${CX} ${cMidY}`} fill="none" stroke="#d1fae5" strokeWidth={1} />
          </g>
        );
      })()}
      <rect x={CX} y={CY} width={CW} height={CH} rx={5} fill="white" stroke="#1f2937" strokeWidth={1.5} />
      <rect x={CX} y={CY} width={CW} height={5} rx={3} fill="#14b8a6" />
      <text x={CX + CW / 2} y={CY + 15} fontSize="7" textAnchor="middle" fill="#111827" fontWeight="bold">{protocol.length > 10 ? protocol.slice(0, 9) + "…" : protocol}</text>
      {freq && <text x={CX + CW / 2} y={CY + 25} fontSize="6" textAnchor="middle" fill="#6b7280">{freq.length > 12 ? freq.slice(0, 11) + "…" : freq}</text>}
      {dstShow.map((item, i) => {
        const by = getBoxY(i, dstRows), my = midY(i, dstRows);
        return (
          <g key={`d${i}`}>
            <path d={`M${CX + CW} ${cMidY} C${DST_X - 18} ${cMidY} ${DST_X - 18} ${my} ${DST_X} ${my}`} fill="none" stroke="#5eead4" strokeWidth={1} markerEnd={`url(#arr-${flow.id})`} />
            <rect x={DST_X} y={by} width={BW} height={BH} rx={3} fill={item.isSystem ? "#f0fdfa" : "#f9fafb"} stroke={item.isSystem ? "#5eead4" : "#d1d5db"} strokeWidth={item.isSystem ? 1.5 : 1} />
            <text x={DST_X + 5} y={by + BH / 2} fontSize="7" fill="#374151" dominantBaseline="middle">{item.label.length > 11 ? item.label.slice(0, 10) + "…" : item.label}</text>
          </g>
        );
      })}
      {dstMore > 0 && (() => {
        const by = getBoxY(dstShow.length, dstRows), my = midY(dstShow.length, dstRows);
        return (
          <g key="dst-more">
            <path d={`M${CX + CW} ${cMidY} C${DST_X - 18} ${cMidY} ${DST_X - 18} ${my} ${DST_X} ${my}`} fill="none" stroke="#d1fae5" strokeWidth={1} markerEnd={`url(#arr-${flow.id})`} />
            <rect x={DST_X} y={by} width={BW} height={BH} rx={3} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 2" />
            <text x={DST_X + BW / 2} y={by + BH / 2} fontSize="7" fill="#9ca3af" textAnchor="middle" dominantBaseline="middle">+{dstMore} more</text>
          </g>
        );
      })()}
    </svg>
  );
}

// ─── Canvas inner (inside ReactFlowProvider) ──────────────────────────────────

interface CanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  hasCustomLayout: boolean;
  exportFilename?: string;
  containerRef?: RefObject<HTMLDivElement | null>;
}

function FlowCanvasInner({
  initialNodes,
  initialEdges,
  onLayoutSave,
  onResetLayout,
  hasCustomLayout,
  exportFilename,
  containerRef,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  const layoutRef = useRef<NodeLayout>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const node of initialNodes) {
      if (!layoutRef.current[node.id]) {
        layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
      }
    }
  }, [initialNodes]);

  useEffect(() => {
    setNodes((prev) =>
      initialNodes.map((node) => {
        const dragged = layoutRef.current[node.id];
        if (dragged) return { ...node, position: dragged };
        const prevNode = prev.find((n) => n.id === node.id);
        if (prevNode?.dragging) return { ...node, position: prevNode.position };
        return node;
      })
    );
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const scheduleSave = useCallback(() => {
    if (!onLayoutSave) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => onLayoutSave({ ...layoutRef.current }), 600);
  }, [onLayoutSave]);

  const handleNodeDragStop: NodeDragHandler = useCallback((_event, node) => {
    layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
    scheduleSave();
  }, [scheduleSave]);

  const handleReset = useCallback(() => {
    onResetLayout?.();
    layoutRef.current = {};
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50);
  }, [onResetLayout, fitView]);

  return (
    // position:absolute + inset:0 gives React Flow a guaranteed pixel height,
    // which is required for its ResizeObserver and mouse event setup.
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={FLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        // Left-click on empty space pans; left-click on a node drags the node.
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-sm" />
        <MiniMap
          nodeColor="#14b8a6"
          maskColor="rgba(255,255,255,0.65)"
          className="!bg-white !border-gray-200 !shadow-sm"
          pannable
          zoomable
        />
      </ReactFlow>

      {exportFilename && (
        <DiagramExportButton
          filename={exportFilename}
          containerEl={containerRef?.current ?? null}
        />
      )}

      {/* Reset layout — always visible so users discover the feature */}
      <button
        type="button"
        onClick={handleReset}
        className={cn(
          "absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-sm border transition-colors",
          hasCustomLayout
            ? "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100"
            : "bg-white border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400"
        )}
        title={hasCustomLayout ? "Reset to auto layout" : "Auto layout (no custom positions saved)"}
      >
        <RotateCcw size={12} />
        {hasCustomLayout ? "Reset layout" : "Auto layout"}
      </button>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <span className="text-[10px] text-gray-400 bg-white/90 border border-gray-200 rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
          Drag nodes · Scroll to zoom · Click background to pan
        </span>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function FlowDiagramModal({
  flow,
  onClose,
  onLayoutSave,
  onResetLayout,
  onArchitectureChange,
}: {
  flow: MinEAObject;
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  onArchitectureChange?: (
    updates: FlowArchitectureUpdate
  ) => void | Promise<MinEAObject | void>;
}) {
  const [liveFlow, setLiveFlow] = useState(flow);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [showDestDialog, setShowDestDialog] = useState(false);
  const [savingArch, setSavingArch] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLiveFlow(flow);
  }, [flow]);

  const props = (liveFlow.properties ?? {}) as IntegrationFlowProperties;
  const savedLayout = props.node_layout;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);
  const srcCount = (props.sources?.systems?.length ?? 0) + (props.sources?.entities?.length ?? 0);
  const dstCount = (props.destinations?.systems?.length ?? 0) + (props.destinations?.entities?.length ?? 0);
  const editable = !!onArchitectureChange;
  const defaultSide: FlowEndpointSide = { systems: [], entities: [] };

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowGraph(liveFlow, savedLayout),
    [liveFlow, savedLayout]
  );

  const applyArchitecture = async (updates: FlowArchitectureUpdate) => {
    if (!onArchitectureChange) return;
    setSavingArch(true);
    try {
      const result = await onArchitectureChange(updates);
      if (result) {
        setLiveFlow(result);
      } else {
        const currentProps = (liveFlow.properties ?? {}) as IntegrationFlowProperties;
        setLiveFlow({
          ...liveFlow,
          properties: {
            ...currentProps,
            ...(updates.sources !== undefined ? { sources: updates.sources } : {}),
            ...(updates.destinations !== undefined ? { destinations: updates.destinations } : {}),
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save architecture changes.";
      toast({ title: "Failed to save", description: message, variant: "destructive" });
    } finally {
      setSavingArch(false);
    }
  };

  const handleSourcesApply = (next: FlowEndpointSide) => {
    setShowSourceDialog(false);
    void applyArchitecture({ sources: next });
  };

  const handleDestinationsApply = (next: FlowEndpointSide) => {
    setShowDestDialog(false);
    void applyArchitecture({ destinations: next });
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={onClose} />
      <div className="fixed inset-6 z-[210] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <DiagramSavingBar active={savingArch} />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-0.5">
              Integration Flow
            </p>
            <h2 className="text-base font-bold text-gray-900">{liveFlow.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-500">
                {srcCount} source{srcCount !== 1 ? "s" : ""} → {dstCount} destination{dstCount !== 1 ? "s" : ""}
              </span>
              {props.protocol && (
                <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium">
                  {PROTOCOL_LABEL[props.protocol] ?? props.protocol}
                </span>
              )}
              {props.format && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium uppercase">
                  {props.format}
                </span>
              )}
              {props.direction && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium capitalize">
                  {props.direction.replace(/_/g, " ")}
                </span>
              )}
              {props.criticality && (
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium capitalize border",
                  CRITICALITY_COLOR[props.criticality] ?? "bg-gray-100 text-gray-600 border-gray-200"
                )}>
                  {props.criticality}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSourceDialog(true)}
                  disabled={savingArch}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {srcCount > 0 ? "Edit sources" : "Add sources"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDestDialog(true)}
                  disabled={savingArch}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {dstCount > 0 ? "Edit destinations" : "Add destinations"}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={canvasRef} className="flex-1 relative bg-[#fafafa] min-h-0">
          <ReactFlowProvider>
            <FlowCanvasInner
              initialNodes={initialNodes}
              initialEdges={initialEdges}
              onLayoutSave={onLayoutSave}
              onResetLayout={onResetLayout}
              hasCustomLayout={hasCustomLayout}
              exportFilename={liveFlow.name}
              containerRef={canvasRef}
            />
          </ReactFlowProvider>
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 flex-shrink-0 flex-wrap">
          {props.frequency && <span className="text-xs text-gray-500">{FREQ_LABEL[props.frequency] ?? props.frequency}</span>}
          {props.auth && <span className="text-xs text-gray-500">Auth: {AUTH_LABEL[props.auth] ?? props.auth}</span>}
          {props.data_classification && (
            <span className="text-xs text-gray-500">
              Classification: <span className="font-medium">{props.data_classification}</span>
            </span>
          )}
          {liveFlow.status && <span className="text-xs text-gray-500 capitalize">Status: {liveFlow.status}</span>}
          {hasCustomLayout && <span className="text-[10px] text-teal-600 font-medium">Layout saved ✓</span>}
          {liveFlow.owner && <span className="text-xs text-gray-500 ml-auto">Owner: {liveFlow.owner}</span>}
        </div>
      </div>

      {showSourceDialog && (
        <AddFlowEndpointDialog
          side="source"
          current={props.sources ?? defaultSide}
          onClose={() => setShowSourceDialog(false)}
          onApply={handleSourcesApply}
        />
      )}

      {showDestDialog && (
        <AddFlowEndpointDialog
          side="destination"
          current={props.destinations ?? defaultSide}
          onClose={() => setShowDestDialog(false)}
          onApply={handleDestinationsApply}
        />
      )}
    </>
  );
}
