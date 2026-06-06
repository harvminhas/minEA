"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AddRuntimeDialog } from "@/components/application/AddRuntimeDialog";
import { AddSystemDialog } from "@/components/application/AddSystemDialog";
import type { ComponentArchitectureUpdate } from "@/lib/component-relationship-utils";
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
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { DiagramExportButton } from "@/components/shared/DiagramExportButton";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { Box, Cpu, Monitor, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COMPONENT_TYPE_LABEL } from "@/lib/component-utils";
import type {
  ComponentProperties,
  ComponentRuntimeRef,
  ComponentSystemRef,
  MinEAObject,
} from "@minea/types";

export type NodeLayout = Record<string, { x: number; y: number }>;

const PLACEHOLDER_NODE_IDS = new Set(["sys-placeholder", "rt-placeholder"]);
const NODE_H = 76;
const GAP = 32;

export function sanitizeNodeLayout(layout?: NodeLayout): NodeLayout | undefined {
  if (!layout) return layout;
  const clean = Object.fromEntries(
    Object.entries(layout).filter(([id]) => !PLACEHOLDER_NODE_IDS.has(id))
  );
  return Object.keys(clean).length > 0 ? clean : undefined;
}

const RUNTIME_KIND_LABEL: Record<string, string> = {
  tool: "Integration tool",
  model: "Runtime model",
  cloud_service: "Cloud service",
};

const SystemNode = memo(({ data }: NodeProps) => (
  <div className="bg-white border-2 border-indigo-300 rounded-lg shadow-sm" style={{ minWidth: 160 }}>
    <Handle type="source" position={Position.Right} style={{ background: "#6366f1" }} />
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-indigo-50 flex items-center justify-center flex-shrink-0">
          <Monitor size={11} className="text-indigo-600" />
        </div>
        <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{data.name}</p>
      </div>
      <p className="text-[9px] text-indigo-600 font-medium pl-7 mt-0.5">System</p>
    </div>
  </div>
));
SystemNode.displayName = "SystemNode";

const ComponentCenterNode = memo(({ data }: NodeProps) => {
  const { component, props } = data as { component: MinEAObject; props: ComponentProperties };
  const typeLabel = COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type;

  return (
    <div className="bg-white rounded-xl shadow-xl border-2 border-gray-800 overflow-hidden" style={{ width: 220 }}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="h-1 bg-indigo-500" />
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Box size={12} className="text-indigo-600" />
          </div>
          <p className="text-sm font-bold text-gray-900 leading-tight truncate">{component.name}</p>
        </div>
        {typeLabel && (
          <span className="inline-block text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">
            {typeLabel}
          </span>
        )}
        {props.tech_stack && (
          <p className="text-[10px] text-gray-500 leading-snug">{props.tech_stack}</p>
        )}
        {component.owner && (
          <p className="text-[9px] text-gray-400 border-t border-gray-100 pt-1.5 truncate">
            Owner: {component.owner}
          </p>
        )}
      </div>
    </div>
  );
});
ComponentCenterNode.displayName = "ComponentCenterNode";

const RuntimeNode = memo(({ data }: NodeProps) => (
  <div className="bg-white border-2 border-violet-300 rounded-lg shadow-sm" style={{ minWidth: 160 }}>
    <Handle type="target" position={Position.Left} style={{ background: "#8b5cf6" }} />
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-violet-50 flex items-center justify-center flex-shrink-0">
          <Cpu size={11} className="text-violet-600" />
        </div>
        <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{data.name}</p>
      </div>
      {data.kind && (
        <p className="text-[9px] text-violet-600 font-medium pl-7 mt-0.5">
          {RUNTIME_KIND_LABEL[data.kind] ?? data.kind}
        </p>
      )}
    </div>
  </div>
));
RuntimeNode.displayName = "RuntimeNode";

const DiagramPlaceholderNode = memo(({ data }: NodeProps) => (
  <button
    type="button"
    disabled={!data.clickable}
    onClick={(e) => {
      e.stopPropagation();
      if (data.clickable) data.onClick?.();
    }}
    className={cn(
      "rounded-lg border-2 border-dashed bg-white/90 px-4 py-3 text-center transition-colors w-full",
      data.clickable
        ? "border-gray-300 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/60"
        : "border-gray-200 opacity-60 cursor-default"
    )}
    style={{ width: 160 }}
  >
    {data.handleSide === "right" && (
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-2 !h-2" />
    )}
    {data.handleSide === "left" && (
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-2 !h-2" />
    )}
    <p className="text-xs text-gray-400">{data.label}</p>
    {data.clickable && (
      <p className="text-[10px] text-indigo-600 font-medium mt-1 inline-flex items-center gap-0.5 justify-center">
        <Plus size={10} />
        {data.hint}
      </p>
    )}
  </button>
));
DiagramPlaceholderNode.displayName = "DiagramPlaceholderNode";

export const COMPONENT_NODE_TYPES: NodeTypes = {
  systemNode: SystemNode,
  componentCenterNode: ComponentCenterNode,
  runtimeNode: RuntimeNode,
  placeholderNode: DiagramPlaceholderNode,
};

export function buildComponentGraph(
  component: MinEAObject,
  savedLayout?: NodeLayout,
  options?: { interactive?: boolean }
): { nodes: Node[]; edges: Edge[] } {
  const interactive = options?.interactive ?? false;
  const props = (component.properties ?? {}) as ComponentProperties;
  const systems = props.systems ?? [];
  const runtime = props.runtime;

  const CENTER_X = 300;
  const RUNTIME_X = CENTER_X + 260;
  const layout = sanitizeNodeLayout(savedLayout);

  function autoPositions(count: number, x: number) {
    const total = Math.max(count, 1) * NODE_H + Math.max(count - 1, 0) * GAP;
    const start = -total / 2;
    return Array.from({ length: Math.max(count, 1) }, (_, i) => ({ x, y: start + i * (NODE_H + GAP) }));
  }

  function pos(id: string, auto: { x: number; y: number }) {
    return layout?.[id] ?? auto;
  }

  const systemSlotCount = systems.length === 0 ? 1 : systems.length;
  const sysPos = autoPositions(systemSlotCount, 0);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeStyle = { stroke: "#6366f1", strokeWidth: 1.5 };
  const marker = { type: MarkerType.ArrowClosed, color: "#6366f1", width: 14, height: 14 };
  const edgeLabelStyle = { fontSize: 10, fontWeight: 500, fill: "#4f46e5" };
  const edgeLabelBgStyle = { fill: "#ffffff", fillOpacity: 0.92, stroke: "#e0e7ff", strokeWidth: 1 };

  if (systems.length === 0) {
    if (!interactive) {
      nodes.push({
        id: "sys-placeholder",
        type: "placeholderNode",
        position: pos("sys-placeholder", sysPos[0]!),
        data: {
          label: "No systems",
          hint: "Add systems",
          handleSide: "right",
          clickable: false,
        },
      });
    }
  } else {
    systems.forEach((sys, i) => {
      const id = `sys-${sys.system_id}`;
      nodes.push({
        id,
        type: "systemNode",
        position: pos(id, sysPos[i]!),
        data: { name: sys.system_name },
      });
      edges.push({
        id: `e-${id}`,
        source: id,
        target: "component-center",
        type: "smoothstep",
        animated: true,
        style: edgeStyle,
        markerEnd: marker,
        label: "is part of",
        labelStyle: edgeLabelStyle,
        labelBgStyle: edgeLabelBgStyle,
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      });
    });
  }

  nodes.push({
    id: "component-center",
    type: "componentCenterNode",
    position: pos("component-center", { x: CENTER_X, y: -50 }),
    data: { component, props },
  });

  const rtPos = autoPositions(1, RUNTIME_X);

  if (runtime) {
    const rtId = `rt-${runtime.runtime_id}`;
    const rtPosition = pos(rtId, rtPos[0]!);
    nodes.push({
      id: rtId,
      type: "runtimeNode",
      position: rtPosition,
      data: { name: runtime.runtime_name, kind: runtime.runtime_kind },
    });
    edges.push({
      id: `e-${rtId}`,
      source: "component-center",
      target: rtId,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#8b5cf6", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6", width: 14, height: 14 },
      label: "runs on",
      labelStyle: { fontSize: 10, fontWeight: 500, fill: "#7c3aed" },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92, stroke: "#ede9fe", strokeWidth: 1 },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 4,
    });
  } else if (!interactive) {
    nodes.push({
      id: "rt-placeholder",
      type: "placeholderNode",
      position: { x: RUNTIME_X, y: rtPos[0]!.y },
      draggable: false,
      data: {
        label: "No runtime",
        hint: "Add runtime",
        handleSide: "left",
        clickable: false,
      },
    });
  }

  return { nodes, edges };
}

export function ComponentDiagramThumbnail({ component }: { component: MinEAObject }) {
  const props = (component.properties ?? {}) as ComponentProperties;
  const systems = props.systems ?? [];
  const runtime = props.runtime;

  const W = 300;
  const H = 100;
  const BW = 76;
  const BH = 20;
  const GAP = 5;
  const SYS_X = 4;
  const RT_X = W - BW - 4;
  const CX = W / 2 - 34;
  const CW = 68;
  const CH = 32;
  const CY = H / 2 - CH / 2;

  const MAX = 3;
  const sysShow = systems.slice(0, MAX);
  const sysMore = Math.max(0, systems.length - MAX);
  const sysRows = sysShow.length + (sysMore > 0 ? 1 : 0);

  function getBoxY(idx: number, total: number) {
    const th = total * BH + Math.max(total - 1, 0) * GAP;
    return H / 2 - th / 2 + idx * (BH + GAP);
  }
  function midY(idx: number, total: number) {
    return getBoxY(idx, total) + BH / 2;
  }

  const cMidY = CY + CH / 2;
  const typeLabel =
    COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type ?? "Component";
  const rtMidY = H / 2;

  if (systems.length === 0 && !runtime) {
    return (
      <div className="flex items-center justify-center h-20 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
        <p className="text-[10px] text-gray-400 italic">Assign systems and runtime to preview</p>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" height={88} aria-hidden="true">
      <defs>
        <marker id={`arr-${component.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#6366f1" />
        </marker>
      </defs>
      {sysShow.map((sys, i) => {
        const by = getBoxY(i, sysRows);
        const my = midY(i, sysRows);
        return (
          <g key={sys.system_id}>
            <rect x={SYS_X} y={by} width={BW} height={BH} rx={3} fill="#eef2ff" stroke="#a5b4fc" strokeWidth={1.5} />
            <text x={SYS_X + 5} y={by + BH / 2} fontSize="7" fill="#374151" dominantBaseline="middle">
              {sys.system_name.length > 11 ? sys.system_name.slice(0, 10) + "…" : sys.system_name}
            </text>
            <path
              d={`M${SYS_X + BW} ${my} C${CX - 18} ${my} ${CX - 18} ${cMidY} ${CX} ${cMidY}`}
              fill="none"
              stroke="#a5b4fc"
              strokeWidth={1}
            />
          </g>
        );
      })}
      {sysMore > 0 &&
        (() => {
          const by = getBoxY(sysShow.length, sysRows);
          const my = midY(sysShow.length, sysRows);
          return (
            <g key="sys-more">
              <rect x={SYS_X} y={by} width={BW} height={BH} rx={3} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 2" />
              <text x={SYS_X + BW / 2} y={by + BH / 2} fontSize="7" fill="#9ca3af" textAnchor="middle" dominantBaseline="middle">
                +{sysMore} more
              </text>
              <path
                d={`M${SYS_X + BW} ${my} C${CX - 18} ${my} ${CX - 18} ${cMidY} ${CX} ${cMidY}`}
                fill="none"
                stroke="#e0e7ff"
                strokeWidth={1}
              />
            </g>
          );
        })()}
      <rect x={CX} y={CY} width={CW} height={CH} rx={5} fill="white" stroke="#1f2937" strokeWidth={1.5} />
      <rect x={CX} y={CY} width={CW} height={5} rx={3} fill="#6366f1" />
      <text x={CX + CW / 2} y={CY + 15} fontSize="7" textAnchor="middle" fill="#111827" fontWeight="bold">
        {typeLabel.length > 10 ? typeLabel.slice(0, 9) + "…" : typeLabel}
      </text>
      {props.tech_stack && (
        <text x={CX + CW / 2} y={CY + 25} fontSize="6" textAnchor="middle" fill="#6b7280">
          {props.tech_stack.length > 12 ? props.tech_stack.slice(0, 11) + "…" : props.tech_stack}
        </text>
      )}
      {runtime ? (
        <g>
          <path
            d={`M${CX + CW} ${cMidY} C${RT_X - 18} ${cMidY} ${RT_X - 18} ${rtMidY} ${RT_X} ${rtMidY}`}
            fill="none"
            stroke="#c4b5fd"
            strokeWidth={1}
            markerEnd={`url(#arr-${component.id})`}
          />
          <rect x={RT_X} y={rtMidY - BH / 2} width={BW} height={BH} rx={3} fill="#f5f3ff" stroke="#c4b5fd" strokeWidth={1.5} />
          <text x={RT_X + 5} y={rtMidY} fontSize="7" fill="#374151" dominantBaseline="middle">
            {runtime.runtime_name.length > 11 ? runtime.runtime_name.slice(0, 10) + "…" : runtime.runtime_name}
          </text>
        </g>
      ) : (
        <text x={RT_X + BW / 2} y={rtMidY} fontSize="7" fill="#d1d5db" textAnchor="middle" dominantBaseline="middle">
          No runtime
        </text>
      )}
    </svg>
  );
}

interface CanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  hasCustomLayout: boolean;
  onPlaceholderClick?: (kind: "systems" | "runtime") => void;
}

function enrichPlaceholderNodes(
  nodes: Node[],
  onPlaceholderClick?: (kind: "systems" | "runtime") => void
): Node[] {
  return nodes.map((node) => {
    if (node.type !== "placeholderNode") return node;
    return {
      ...node,
      data: {
        ...node.data,
        onClick: () => {
          if (node.id === "sys-placeholder") onPlaceholderClick?.("systems");
          if (node.id === "rt-placeholder") onPlaceholderClick?.("runtime");
        },
      },
    };
  });
}

function ComponentCanvasInner({
  initialNodes,
  initialEdges,
  onLayoutSave,
  onResetLayout,
  hasCustomLayout,
  onPlaceholderClick,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    enrichPlaceholderNodes(initialNodes, onPlaceholderClick)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const layoutRef = useRef<NodeLayout>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const node of initialNodes) {
      if (PLACEHOLDER_NODE_IDS.has(node.id)) continue;
      if (!layoutRef.current[node.id]) {
        layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
      }
    }
  }, [initialNodes]);

  useEffect(() => {
    setNodes((prev) =>
      enrichPlaceholderNodes(initialNodes, onPlaceholderClick).map((node) => {
        if (PLACEHOLDER_NODE_IDS.has(node.id)) return node;
        const prevNode = prev.find((n) => n.id === node.id);
        const dragged = layoutRef.current[node.id];
        if (dragged) return { ...node, position: dragged };
        if (prevNode?.dragging) return { ...node, position: prevNode.position };
        return node;
      })
    );
  }, [initialNodes, setNodes, onPlaceholderClick]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const scheduleSave = useCallback(() => {
    if (!onLayoutSave) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(
      () => onLayoutSave(sanitizeNodeLayout(layoutRef.current) ?? {}),
      600
    );
  }, [onLayoutSave]);

  const handleNodeDrag: NodeDragHandler = useCallback((_event, node) => {
    if (PLACEHOLDER_NODE_IDS.has(node.id)) return;
    layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      if (PLACEHOLDER_NODE_IDS.has(node.id)) return;
      layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleReset = useCallback(() => {
    onResetLayout?.();
    layoutRef.current = {};
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50);
  }, [onResetLayout, fitView]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (!onPlaceholderClick || node.type !== "placeholderNode") return;
      if (node.id === "sys-placeholder") onPlaceholderClick("systems");
      if (node.id === "rt-placeholder") onPlaceholderClick("runtime");
    },
    [onPlaceholderClick]
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={COMPONENT_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
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
          nodeColor="#6366f1"
          maskColor="rgba(255,255,255,0.65)"
          className="!bg-white !border-gray-200 !shadow-sm"
          pannable
          zoomable
        />
      </ReactFlow>

      <button
        type="button"
        onClick={handleReset}
        data-export-ignore
        className={cn(
          "absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-sm border transition-colors",
          hasCustomLayout
            ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            : "bg-white border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400"
        )}
        title={hasCustomLayout ? "Reset to auto layout" : "Auto layout (no custom positions saved)"}
      >
        <RotateCcw size={12} />
        {hasCustomLayout ? "Reset layout" : "Auto layout"}
      </button>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none" data-export-ignore>
        <span className="text-[10px] text-gray-400 bg-white/90 border border-gray-200 rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
          Drag nodes to reposition · Scroll to zoom · Click background to pan
        </span>
      </div>
    </div>
  );
}

export function ComponentDiagramModal({
  component,
  onClose,
  onLayoutSave,
  onResetLayout,
  onArchitectureChange,
}: {
  component: MinEAObject;
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  onArchitectureChange?: (
    updates: ComponentArchitectureUpdate
  ) => void | Promise<MinEAObject | void>;
}) {
  const [liveComponent, setLiveComponent] = useState(component);
  const [showSystemDialog, setShowSystemDialog] = useState(false);
  const [showRuntimeDialog, setShowRuntimeDialog] = useState(false);
  const [savingArch, setSavingArch] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const saving = savingArch || savingLayout;

  useEffect(() => {
    setLiveComponent(component);
  }, [component]);

  const props = (liveComponent.properties ?? {}) as ComponentProperties;
  const savedLayout = sanitizeNodeLayout(props.node_layout);
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);
  const sysCount = props.systems?.length ?? 0;
  const editable = !!onArchitectureChange;

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildComponentGraph(liveComponent, savedLayout, { interactive: editable }),
    [liveComponent, savedLayout, editable]
  );

  const typeLabel = COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type;

  const applyArchitecture = async (updates: ComponentArchitectureUpdate) => {
    if (!onArchitectureChange) return;
    setSavingArch(true);
    try {
      const result = await onArchitectureChange(updates);
      if (result) {
        setLiveComponent(result);
      } else {
        const currentProps = (liveComponent.properties ?? {}) as ComponentProperties;
        setLiveComponent({
          ...liveComponent,
          properties: {
            ...currentProps,
            ...(updates.systems !== undefined ? { systems: updates.systems } : {}),
            ...(updates.runtime !== undefined ? { runtime: updates.runtime } : {}),
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save architecture changes.";
      toast({
        title: "Failed to save",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSavingArch(false);
    }
  };

  const handleSystemsApply = (systems: ComponentSystemRef[]) => {
    setShowSystemDialog(false);
    void applyArchitecture({ systems });
  };

  const handleRuntimeApply = (runtime: ComponentRuntimeRef | null) => {
    setShowRuntimeDialog(false);
    void applyArchitecture({ runtime });
  };

  const handleLayoutSave = async (layout: NodeLayout) => {
    if (!onLayoutSave) return;
    setSavingLayout(true);
    try {
      await onLayoutSave(layout);
    } finally {
      setSavingLayout(false);
    }
  };

  const handleResetLayout = async () => {
    if (!onResetLayout) return;
    setSavingLayout(true);
    try {
      await onResetLayout();
    } finally {
      setSavingLayout(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={onClose} />
      <div className="fixed inset-6 z-[210] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <DiagramSavingBar
          active={saving}
          label={savingArch ? "Saving changes…" : "Saving layout…"}
        />
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-0.5">
              Component architecture
            </p>
            <h2 className="text-base font-bold text-gray-900">{liveComponent.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-500">
                {sysCount} system{sysCount !== 1 ? "s" : ""}
                {props.runtime ? ` · runs on ${props.runtime.runtime_name}` : ""}
              </span>
              {typeLabel && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">
                  {typeLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSystemDialog(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {sysCount > 0 ? "Edit systems" : "Add systems"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRuntimeDialog(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {props.runtime ? "Change runtime" : "Add runtime"}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={canvasRef} className="flex-1 relative bg-[#fafafa]">
          <ReactFlowProvider>
            <ComponentCanvasInner
              initialNodes={initialNodes}
              initialEdges={initialEdges}
              onLayoutSave={onLayoutSave ? handleLayoutSave : undefined}
              onResetLayout={onResetLayout ? handleResetLayout : undefined}
              hasCustomLayout={hasCustomLayout}
            />
            <DiagramExportButton
              filename={liveComponent.name}
              containerRef={canvasRef}
              slugFallback="component"
              emptyMessage="Add at least one system or runtime before exporting."
              filterNodes={(nodes) =>
                nodes.filter(
                  (n) => n.type !== "placeholderNode" && !PLACEHOLDER_NODE_IDS.has(n.id)
                )
              }
            />
          </ReactFlowProvider>
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 flex-shrink-0 flex-wrap">
          {props.tech_stack && <span className="text-xs text-gray-500">{props.tech_stack}</span>}
          {liveComponent.status && (
            <span className="text-xs text-gray-500 capitalize">Lifecycle: {liveComponent.status}</span>
          )}
          {hasCustomLayout && <span className="text-[10px] text-indigo-600 font-medium">Layout saved ✓</span>}
          {liveComponent.owner && <span className="text-xs text-gray-500 ml-auto">Owner: {liveComponent.owner}</span>}
        </div>
      </div>

      {showSystemDialog && (
        <AddSystemDialog
          selected={props.systems ?? []}
          onClose={() => setShowSystemDialog(false)}
          onApply={handleSystemsApply}
        />
      )}

      {showRuntimeDialog && (
        <AddRuntimeDialog
          selected={props.runtime ?? null}
          onClose={() => setShowRuntimeDialog(false)}
          onApply={handleRuntimeApply}
        />
      )}
    </>
  );
}
