"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { otherRelationshipObjectId } from "@/lib/relationship-display";
import {
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "reactflow";
import {
  Box,
  Braces,
  Cpu,
  Database,
  Layers,
  Link2,
  Plus,
  Server,
  Target,
  X,
  Zap,
} from "lucide-react";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";
import {
  extractSystemDiagramLinks,
  type SystemDiagramLink,
} from "@/lib/system-relationship-utils";
import { relationshipVerb } from "@/lib/relationship-display";
import { OBJECT_TYPE_LABELS, type ApplicationProperties, type MinEAObject, type ObjectType, type Relationship } from "@minea/types";
import { cn } from "@/lib/utils";

export type { NodeLayout };

function withEdgeLabel(
  label: string,
  compact?: boolean
): Pick<Edge, "label" | "labelStyle" | "labelBgStyle" | "labelBgPadding" | "labelBgBorderRadius"> {
  return {
    label: compact && label.length > 8 ? label.slice(0, 6) + "…" : label,
    labelStyle: { fill: "#64748b", fontSize: compact ? 7 : 10, fontWeight: 500 },
    labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
    labelBgPadding: compact ? ([2, 1] as [number, number]) : ([4, 2] as [number, number]),
    labelBgBorderRadius: compact ? 2 : 4,
  };
}

function nodeAccent(type: ObjectType): { border: string; bg: string; text: string } {
  switch (type) {
    case "api":
      return { border: "border-teal-300", bg: "bg-teal-50", text: "text-teal-700" };
    case "event":
      return { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-700" };
    case "application":
    case "solution":
    case "technical_capability":
      return { border: "border-indigo-300", bg: "bg-indigo-50", text: "text-indigo-700" };
    case "component":
      return { border: "border-violet-300", bg: "bg-violet-50", text: "text-violet-700" };
    case "data_object":
    case "data_store":
    case "data_domain":
      return { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800" };
    case "cloud_service":
    case "model":
    case "tool":
    case "message_broker":
      return { border: "border-slate-300", bg: "bg-slate-50", text: "text-slate-700" };
    case "capability":
      return { border: "border-blue-300", bg: "bg-blue-50", text: "text-blue-700" };
    default:
      return { border: "border-gray-300", bg: "bg-gray-50", text: "text-gray-700" };
  }
}

function LinkedObjectIcon({ type, size = 11 }: { type: ObjectType; size?: number }) {
  switch (type) {
    case "api":
      return <Braces size={size} className="text-teal-600" />;
    case "event":
      return <Zap size={size} className="text-amber-600" />;
    case "application":
    case "solution":
    case "technical_capability":
      return <Layers size={size} className="text-indigo-600" />;
    case "component":
      return <Box size={size} className="text-violet-600" />;
    case "data_object":
    case "data_store":
    case "data_domain":
      return <Database size={size} className="text-amber-700" />;
    case "cloud_service":
      return <Server size={size} className="text-slate-600" />;
    case "model":
    case "tool":
    case "message_broker":
      return <Cpu size={size} className="text-slate-600" />;
    case "capability":
      return <Target size={size} className="text-blue-600" />;
    default:
      return <Link2 size={size} className="text-gray-500" />;
  }
}

function SystemCenterNode({
  data,
  compact,
}: {
  data: { system: MinEAObject; subtitle: string };
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="bg-white border-2 border-indigo-400 rounded-md overflow-hidden min-w-[72px] max-w-[88px]">
        <Handle type="source" position={Position.Right} id="right" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Left} id="left" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="!opacity-0 !w-1 !h-1" />
        <Handle type="target" position={Position.Top} id="top" className="!opacity-0 !w-1 !h-1" />
        <div className="h-1 bg-indigo-500" />
        <p className="text-[8px] font-bold text-gray-900 px-1 py-1 truncate text-center">{data.system.name}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl border-2 border-indigo-400 overflow-hidden w-[220px]">
      <Handle type="source" position={Position.Right} id="right" style={{ background: APPLICATION_LAYER_COLOR }} />
      <Handle type="source" position={Position.Left} id="left" style={{ background: APPLICATION_LAYER_COLOR }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: APPLICATION_LAYER_COLOR }} />
      <Handle type="target" position={Position.Top} id="top" style={{ background: APPLICATION_LAYER_COLOR }} />
      <div className="h-1 bg-indigo-500" />
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Layers size={12} className="text-indigo-600" />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{data.system.name}</p>
        </div>
        {data.subtitle && <p className="text-[10px] text-gray-400 truncate">{data.subtitle}</p>}
      </div>
    </div>
  );
}

function LinkedObjectNode({
  data,
  compact,
}: {
  data: { link: SystemDiagramLink };
  compact?: boolean;
}) {
  const accent = nodeAccent(data.link.objectType);
  const typeLabel = OBJECT_TYPE_LABELS[data.link.objectType] ?? data.link.objectType.replace(/_/g, " ");

  if (compact) {
    return (
      <div className={cn("rounded px-1.5 py-1 min-w-[68px] max-w-[84px] border", accent.bg, accent.border)}>
        <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
        <p className={cn("text-[8px] font-medium truncate", accent.text)}>{data.link.name}</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg shadow-sm min-w-[150px] border-2 bg-white", accent.border)}>
      <Handle type="target" position={Position.Left} id="left" style={{ background: APPLICATION_LAYER_COLOR }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: APPLICATION_LAYER_COLOR }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={cn("h-5 w-5 rounded flex items-center justify-center flex-shrink-0", accent.bg)}>
            <LinkedObjectIcon type={data.link.objectType} />
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate">{data.link.name}</p>
        </div>
        <p className={cn("text-[9px] font-medium pl-7 mt-0.5", accent.text)}>{typeLabel}</p>
      </div>
    </div>
  );
}

const SystemCenterNodeFull = memo((props: NodeProps) => <SystemCenterNode data={props.data} />);
SystemCenterNodeFull.displayName = "SystemCenterNodeFull";
const SystemCenterNodeCompact = memo((props: NodeProps) => (
  <SystemCenterNode data={props.data} compact />
));
SystemCenterNodeCompact.displayName = "SystemCenterNodeCompact";
const LinkedObjectNodeFull = memo((props: NodeProps) => <LinkedObjectNode data={props.data} />);
LinkedObjectNodeFull.displayName = "LinkedObjectNodeFull";
const LinkedObjectNodeCompact = memo((props: NodeProps) => (
  <LinkedObjectNode data={props.data} compact />
));
LinkedObjectNodeCompact.displayName = "LinkedObjectNodeCompact";

export const SYSTEM_NODE_TYPES: NodeTypes = {
  systemCenterNode: SystemCenterNodeFull,
  systemLinkedNode: LinkedObjectNodeFull,
};

export const SYSTEM_NODE_TYPES_COMPACT: NodeTypes = {
  systemCenterNode: SystemCenterNodeCompact,
  systemLinkedNode: LinkedObjectNodeCompact,
};

function autoColumn(count: number, x: number, startY: number, step: number) {
  return Array.from({ length: Math.max(count, 0) }, (_, i) => ({
    x,
    y: startY + i * step,
  }));
}

const DATA_TECH_TYPES = new Set<ObjectType>([
  "data_object",
  "data_store",
  "data_domain",
  "cloud_service",
  "model",
  "tool",
  "message_broker",
]);

export function buildSystemGraph(
  system: MinEAObject,
  relationships: Relationship[],
  nameById: Record<string, string>,
  compact?: boolean,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const links = extractSystemDiagramLinks(system.id, relationships, nameById);

  const NODE_H = compact ? 32 : 68;
  const GAP = compact ? 10 : 22;
  const step = NODE_H + GAP;
  const CENTER_X = compact ? 96 : 300;
  const CENTER_Y = compact ? 48 : 0;
  const RIGHT_X = compact ? 210 : 560;
  const LEFT_X = compact ? -16 : 40;
  const BOTTOM_Y = compact ? 118 : 180;

  function pos(id: string, auto: { x: number; y: number }) {
    if (compact) return auto;
    return savedLayout?.[id] ?? auto;
  }

  const props = (system.properties ?? {}) as ApplicationProperties;
  const subtitle = props.platform?.platform_name ?? (OBJECT_TYPE_LABELS[system.type] ?? "System");

  const nodes: Node[] = [
    {
      id: "system-center",
      type: "systemCenterNode",
      position: pos("system-center", { x: CENTER_X, y: CENTER_Y }),
      data: { system, subtitle },
    },
  ];
  const edges: Edge[] = [];

  const marker = compact
    ? undefined
    : { type: MarkerType.ArrowClosed, color: APPLICATION_LAYER_COLOR, width: 12, height: 12 };

  function addLinkedNodes(
    group: SystemDiagramLink[],
    positions: { x: number; y: number }[],
    sourceHandle: string,
    targetHandle: string,
    outbound: boolean
  ) {
    group.forEach((link, i) => {
      const nodeId = `link-${link.objectId}-${link.relationshipType}-${link.direction}`;
      const auto = positions[i] ?? positions[positions.length - 1] ?? { x: RIGHT_X, y: 0 };
      nodes.push({
        id: nodeId,
        type: "systemLinkedNode",
        position: pos(nodeId, auto),
        data: { link },
      });

      const shortLabel = relationshipVerb(link.relationshipType);
      if (outbound) {
        edges.push({
          id: `e-${nodeId}-out`,
          source: "system-center",
          sourceHandle,
          target: nodeId,
          targetHandle: "left",
          type: "smoothstep",
          style: { stroke: APPLICATION_LAYER_COLOR, strokeWidth: compact ? 1 : 1.5 },
          markerEnd: marker,
          ...withEdgeLabel(shortLabel, compact),
        });
      } else {
        edges.push({
          id: `e-${nodeId}-in`,
          source: nodeId,
          sourceHandle: "right",
          target: "system-center",
          targetHandle: "top",
          type: "smoothstep",
          style: { stroke: "#94a3b8", strokeWidth: compact ? 1 : 1.5 },
          markerEnd: marker,
          ...withEdgeLabel(shortLabel, compact),
        });
      }
    });
  }

  const outbound = links.filter((l) => l.direction === "outbound");
  const inbound = links.filter((l) => l.direction === "inbound");

  const rightOutbound = outbound.filter((l) => !DATA_TECH_TYPES.has(l.objectType));
  const bottomOutbound = outbound.filter((l) => DATA_TECH_TYPES.has(l.objectType));

  addLinkedNodes(
    rightOutbound,
    autoColumn(rightOutbound.length, RIGHT_X, CENTER_Y - ((rightOutbound.length - 1) * step) / 2, step),
    "right",
    "left",
    true
  );
  addLinkedNodes(
    inbound,
    autoColumn(inbound.length, LEFT_X, CENTER_Y - ((inbound.length - 1) * step) / 2, step),
    "left",
    "right",
    false
  );
  addLinkedNodes(
    bottomOutbound,
    autoColumn(
      bottomOutbound.length,
      CENTER_X - ((bottomOutbound.length - 1) * (compact ? 72 : 180)) / 2,
      BOTTOM_Y,
      compact ? 72 : 180
    ),
    "bottom",
    "left",
    true
  );

  return { nodes, edges };
}

interface GraphProps {
  system: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  className?: string;
  compact?: boolean;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  exportFilename?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function SystemArchitectureGraph({
  system,
  relationships,
  nameById,
  className,
  compact,
  onLayoutSave,
  onResetLayout,
  exportFilename,
  containerRef,
}: GraphProps) {
  const props = (system.properties ?? {}) as ApplicationProperties;
  const savedLayout = props.node_layout;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);

  const { nodes, edges } = useMemo(
    () => buildSystemGraph(system, relationships, nameById, compact, compact ? undefined : savedLayout),
    [system, relationships, nameById, compact, savedLayout]
  );

  return (
    <div className={cn("relative overflow-hidden", compact ? "h-[160px]" : "h-full", className)}>
      <EntityFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={compact ? SYSTEM_NODE_TYPES_COMPACT : SYSTEM_NODE_TYPES}
        mode={compact ? "thumbnail" : "full"}
        accentColor={APPLICATION_LAYER_COLOR}
        fitViewPadding={compact ? 0.1 : 0.2}
        onLayoutSave={compact ? undefined : onLayoutSave}
        onResetLayout={compact ? undefined : onResetLayout}
        hasCustomLayout={hasCustomLayout}
        exportFilename={compact ? undefined : exportFilename}
        containerRef={containerRef}
        emptyLabel="Add connections to see the relationship map"
        className={cn("h-full rounded-lg border border-gray-200", compact && "rounded-none border-0")}
      />
    </div>
  );
}

export function SystemDiagramModal({
  system,
  relationships,
  onClose,
  onLayoutSave,
  onResetLayout,
  onAddConnection,
}: {
  system: MinEAObject;
  relationships: Relationship[];
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void | Promise<void>;
  onResetLayout?: () => void | Promise<void>;
  onAddConnection?: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [liveSystem, setLiveSystem] = useState(system);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    setLiveSystem(system);
  }, [system]);

  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of relationships) {
      ids.add(otherRelationshipObjectId(rel, system.id));
    }
    return [...ids];
  }, [relationships, system.id]);

  const nameQueries = useQueries({
    queries: relatedIds.map((id) => ({
      queryKey: ["object", orgSlug, workspaceSlug, id],
      queryFn: async () => {
        const token = await getToken();
        return objectsApi.get(orgSlug, workspaceSlug, id, token!);
      },
    })),
  });

  const nameById = useMemo(() => {
    const map: Record<string, string> = { [system.id]: system.name };
    for (const query of nameQueries) {
      if (query.data) map[query.data.id] = query.data.name;
    }
    return map;
  }, [nameQueries, system.id, system.name]);

  const props = (liveSystem.properties ?? {}) as ApplicationProperties;
  const linkCount = extractSystemDiagramLinks(liveSystem.id, relationships, nameById).length;
  const hasCustomLayout = !!(props.node_layout && Object.keys(props.node_layout).length > 0);

  const handleLayoutSave = async (layout: NodeLayout) => {
    const currentProps = (liveSystem.properties ?? {}) as ApplicationProperties;
    setLiveSystem({
      ...liveSystem,
      properties: { ...currentProps, node_layout: layout },
    });
    if (!onLayoutSave) return;
    setSavingLayout(true);
    try {
      await onLayoutSave(layout);
    } finally {
      setSavingLayout(false);
    }
  };

  const handleResetLayout = async () => {
    const currentProps = (liveSystem.properties ?? {}) as ApplicationProperties;
    setLiveSystem({
      ...liveSystem,
      properties: { ...currentProps, node_layout: undefined },
    });
    if (!onResetLayout) return;
    setSavingLayout(true);
    try {
      await Promise.resolve(onResetLayout());
    } finally {
      setSavingLayout(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={onClose} />
      <div className="fixed inset-6 z-[210] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <DiagramSavingBar active={savingLayout} label="Saving layout…" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-0.5">
              System relationships
            </p>
            <h2 className="text-base font-bold text-gray-900">{liveSystem.name}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {OBJECT_TYPE_LABELS[liveSystem.type] ?? "System"}
              {linkCount > 0 ? ` · ${linkCount} connection${linkCount !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onAddConnection && (
              <button
                type="button"
                onClick={onAddConnection}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <Plus size={14} />
                Add connection
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={canvasRef} className="flex-1 relative min-h-0">
          <SystemArchitectureGraph
            system={liveSystem}
            relationships={relationships}
            nameById={nameById}
            onLayoutSave={handleLayoutSave}
            onResetLayout={handleResetLayout}
            exportFilename={liveSystem.name}
            containerRef={canvasRef}
          />
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex items-center gap-4 flex-wrap">
          <p className="text-xs text-gray-400">
            Drag nodes to rearrange — positions save automatically. Use Add connection to link systems,
            components, data objects, and technology.
          </p>
          {hasCustomLayout && (
            <span className="text-[10px] text-indigo-600 font-medium ml-auto">Layout saved ✓</span>
          )}
        </div>
      </div>
    </>
  );
}
