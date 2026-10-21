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
  Database,
  Layers,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { DiagramFlowNode, DiagramLinkedObjectNode } from "@/components/shared/DiagramNodes";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";
import { diagramTypeLabel, flowDiagramNodeMeta } from "@/lib/diagram-node-styles";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";
import {
  extractSystemDiagramFlows,
  extractSystemDiagramLinks,
  mergeSystemDiagramLinks,
  mergedSystemDiagramEdgeLabel,
  systemDiagramFlowNodeId,
  systemDiagramNodeId,
  systemDiagramPeerNodeId,
  type MergedSystemDiagramLink,
  type SystemDiagramFlowLink,
} from "@/lib/system-relationship-utils";
import { flowUsesDashedConnector } from "@/lib/flow-utils";
import { OBJECT_TYPE_LABELS, type ApplicationProperties, type FlowMechanism, type MinEAObject, type ObjectType, type Relationship } from "@minea/types";
import { cn } from "@/lib/utils";
import { expandSystemGraph, mapNeighbors, nodeObjectId, objectOpenHref, PER_NODE_CAP, savableLayout, type MapNodeExtras } from "@/lib/map-expand";
import { uiTypeLabel } from "@/lib/ui-type-labels";

export type { NodeLayout };

function withEdgeLabel(
  label: string,
  compact?: boolean
): Pick<Edge, "label" | "labelStyle" | "labelBgStyle" | "labelBgPadding" | "labelBgBorderRadius"> {
  const maxLen = compact ? 10 : 56;
  return {
    label: compact && label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label,
    labelStyle: { fill: "#64748b", fontSize: compact ? 7 : 10, fontWeight: 500 },
    labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
    labelBgPadding: compact ? ([2, 1] as [number, number]) : ([4, 2] as [number, number]),
    labelBgBorderRadius: compact ? 2 : 4,
  };
}

function flowEdgeStyle(mechanism?: FlowMechanism, compact?: boolean) {
  return {
    stroke: "#64748b",
    strokeWidth: compact ? 1 : 1.5,
    ...(flowUsesDashedConnector(mechanism) ? { strokeDasharray: "6 4" } : {}),
  };
}

function SystemCenterNode({
  data,
  compact,
}: {
  data: { system: MinEAObject; subtitle: string; accentColor: string };
  compact?: boolean;
}) {
  const ai = data.system.type === "agent" || data.system.type === "ai_model";
  const CenterIcon = ai ? Sparkles : data.system.type === "data_object" ? Database : Layers;
  const centerIconClass =
    ai ? "text-violet-700 bg-violet-100" : data.system.type === "data_object" ? "text-violet-600 bg-violet-50" : "text-indigo-600 bg-indigo-50";

  if (compact) {
    return (
      <div
        className="bg-white border-2 rounded-md overflow-hidden min-w-[72px] max-w-[88px]"
        style={{ borderColor: data.accentColor }}
      >
        <Handle type="source" position={Position.Right} id="right" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Left} id="left" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="!opacity-0 !w-1 !h-1" />
        <Handle type="target" position={Position.Top} id="top" className="!opacity-0 !w-1 !h-1" />
        <Handle type="target" position={Position.Left} id="left-in" className="!opacity-0 !w-1 !h-1" />
        <div className="h-1" style={{ backgroundColor: data.accentColor }} />
        <p className="text-[8px] font-bold text-gray-900 px-1 py-1 truncate text-center">{data.system.name}</p>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl shadow-xl border-2 overflow-hidden w-[220px]"
      style={{ borderColor: data.accentColor }}
    >
      <Handle type="source" position={Position.Right} id="right" style={{ background: data.accentColor }} />
      <Handle type="source" position={Position.Left} id="left" style={{ background: data.accentColor }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: data.accentColor }} />
      <Handle type="target" position={Position.Top} id="top" style={{ background: data.accentColor }} />
      <Handle type="target" position={Position.Left} id="left-in" style={{ background: data.accentColor }} />
      <div className="h-1" style={{ backgroundColor: data.accentColor }} />
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-6 w-6 rounded flex items-center justify-center flex-shrink-0", centerIconClass)}>
            <CenterIcon size={12} />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{data.system.name}</p>
        </div>
        {data.subtitle && <p className="text-[10px] text-gray-400 truncate">{data.subtitle}</p>}
      </div>
    </div>
  );
}

/** "+N" (links still off the map) or "−" (expanded) on a node, and a dashed look for revealed nodes. */
function NodeExtras({ data, compact, children }: { data: MapNodeExtras; compact?: boolean; children: React.ReactNode }) {
  const badge = data.badge;
  return (
    <div
      className={cn(
        "relative rounded-lg",
        data.revealed && "[&>div]:!border-dashed [&>div]:!border-indigo-300",
        data.selected && "ring-4 ring-indigo-500/20"
      )}
      data-revealed={data.revealed ? "true" : undefined}
    >
      {children}
      {(data.expanded || (badge ?? 0) > 0) && (
        <span
          data-testid="map-badge"
          data-export-ignore
          className={cn(
            "pointer-events-none absolute rounded-full border-2 border-white font-semibold leading-none",
            compact ? "-right-1.5 -top-1.5 px-1 py-[1px] text-[6px]" : "-right-2.5 -top-2.5 px-1.5 py-[3px] text-[10.5px]",
            data.expanded ? "bg-white text-indigo-600 !border-indigo-500" : "bg-indigo-600 text-white"
          )}
        >
          {data.expanded ? "−" : `+${badge}`}
        </span>
      )}
    </div>
  );
}

function FlowLinkedNode({
  data,
  compact,
}: {
  data: { flow: MinEAObject } & MapNodeExtras;
  compact?: boolean;
}) {
  return (
    <NodeExtras data={data} compact={compact}>
      <DiagramFlowNode meta={flowDiagramNodeMeta(data.flow)} compact={compact} />
    </NodeExtras>
  );
}

function MoreNode({ data }: { data: { count: number } }) {
  return (
    <div className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700" data-testid="map-more">
      <Handle type="target" position={Position.Left} id="left" className="!opacity-0 !w-1 !h-1" />
      +{data.count} more
    </div>
  );
}

function LinkedObjectNode({
  data,
  compact,
}: {
  data: { link: MergedSystemDiagramLink } & MapNodeExtras;
  compact?: boolean;
}) {
  return (
    <NodeExtras data={data} compact={compact}>
      <DiagramLinkedObjectNode
        name={data.link.name}
        objectType={data.link.objectType}
        compact={compact}
        handleColor={APPLICATION_LAYER_COLOR}
      />
    </NodeExtras>
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
const FlowLinkedNodeFull = memo((props: NodeProps) => <FlowLinkedNode data={props.data} />);
FlowLinkedNodeFull.displayName = "FlowLinkedNodeFull";
const FlowLinkedNodeCompact = memo((props: NodeProps) => (
  <FlowLinkedNode data={props.data} compact />
));
FlowLinkedNodeCompact.displayName = "FlowLinkedNodeCompact";

const MoreNodeFull = memo((props: NodeProps) => <MoreNode data={props.data} />);
MoreNodeFull.displayName = "MoreNodeFull";

export const SYSTEM_NODE_TYPES: NodeTypes = {
  systemCenterNode: SystemCenterNodeFull,
  systemLinkedNode: LinkedObjectNodeFull,
  systemFlowNode: FlowLinkedNodeFull,
  systemMoreNode: MoreNodeFull,
};

export const SYSTEM_NODE_TYPES_COMPACT: NodeTypes = {
  systemCenterNode: SystemCenterNodeCompact,
  systemLinkedNode: LinkedObjectNodeCompact,
  systemFlowNode: FlowLinkedNodeCompact,
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
  flows: MinEAObject[] = [],
  compact?: boolean,
  savedLayout?: NodeLayout,
  accentColor: string = APPLICATION_LAYER_COLOR
): { nodes: Node[]; edges: Edge[] } {
  const links = mergeSystemDiagramLinks(
    extractSystemDiagramLinks(system.id, relationships, nameById)
  );
  const flowLinks = extractSystemDiagramFlows(system.id, flows);
  const flowById = new Map(flows.map((flow) => [flow.id, flow]));

  const NODE_H = compact ? 32 : 68;
  const GAP = compact ? 10 : 22;
  const step = NODE_H + GAP;
  const CENTER_X = compact ? 96 : 300;
  const CENTER_Y = compact ? 48 : 0;
  const RIGHT_X = compact ? 210 : 560;
  const LEFT_X = compact ? -16 : 40;
  const PEER_X = compact ? 300 : 820;
  const FLOW_PEER_LEFT_X = compact ? 96 : 180;
  const BOTTOM_Y = compact ? 118 : 180;

  function pos(nodeId: string, objectId: string, auto: { x: number; y: number }) {
    if (compact) return auto;
    if (savedLayout?.[nodeId]) return savedLayout[nodeId];
    // Support layouts saved before relationship labels were merged onto one node.
    if (savedLayout) {
      const legacyPrefix = `link-${objectId}-`;
      const legacy = Object.entries(savedLayout).find(([key]) => key.startsWith(legacyPrefix));
      if (legacy) return legacy[1];
    }
    return auto;
  }

  const props = (system.properties ?? {}) as ApplicationProperties;
  const subtitle =
    system.type === "agent" || system.type === "ai_model"
      ? diagramTypeLabel(system.type)
      : system.type === "data_object"
      ? (OBJECT_TYPE_LABELS[system.type] ?? "Data entity")
      : (props.platform?.platform_name ?? (OBJECT_TYPE_LABELS[system.type] ?? "System"));

  const nodes: Node[] = [
    {
      id: "system-center",
      type: "systemCenterNode",
      position: pos("system-center", system.id, { x: CENTER_X, y: CENTER_Y }),
      data: { system, subtitle, accentColor },
    },
  ];
  const edges: Edge[] = [];

  const marker = compact
    ? undefined
    : { type: MarkerType.ArrowClosed, color: accentColor, width: 12, height: 12 };

  const flowMarker = compact
    ? undefined
    : { type: MarkerType.ArrowClosed, color: "#64748b", width: 12, height: 12 };

  function findLinkedNodeId(objectId: string): string | null {
    const match = nodes.find(
      (node) => node.id === systemDiagramNodeId({ objectId, direction: "outbound" }) ||
        node.id === systemDiagramNodeId({ objectId, direction: "inbound" }) ||
        node.id === systemDiagramPeerNodeId(objectId)
    );
    return match?.id ?? null;
  }

  function ensurePeerNode(
    peer: NonNullable<SystemDiagramFlowLink["peer"]>,
    position: { x: number; y: number }
  ): string {
    const existing = findLinkedNodeId(peer.objectId);
    if (existing) return existing;

    const nodeId = systemDiagramPeerNodeId(peer.objectId);
    if (nodes.some((node) => node.id === nodeId)) return nodeId;

    nodes.push({
      id: nodeId,
      type: "systemLinkedNode",
      position: pos(nodeId, peer.objectId, position),
      data: {
        link: {
          objectId: peer.objectId,
          name: peer.name,
          objectType: peer.objectType,
          direction: "outbound",
          relationshipTypes: [],
        } satisfies MergedSystemDiagramLink,
      },
    });
    return nodeId;
  }

  function addLinkedNodes(
    group: MergedSystemDiagramLink[],
    positions: { x: number; y: number }[],
    sourceHandle: string,
    targetHandle: string,
    outbound: boolean
  ) {
    group.forEach((link, i) => {
      const nodeId = systemDiagramNodeId(link);
      const auto = positions[i] ?? positions[positions.length - 1] ?? { x: RIGHT_X, y: 0 };
      nodes.push({
        id: nodeId,
        type: "systemLinkedNode",
        position: pos(nodeId, link.objectId, auto),
        data: { link },
      });

      const edgeLabel = mergedSystemDiagramEdgeLabel(link, system.type);
      if (outbound) {
        edges.push({
          id: `e-${nodeId}-out`,
          source: "system-center",
          sourceHandle,
          target: nodeId,
          targetHandle: "left",
          type: "smoothstep",
          style: { stroke: accentColor, strokeWidth: compact ? 1 : 1.5 },
          markerEnd: marker,
          ...withEdgeLabel(edgeLabel, compact),
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
          ...withEdgeLabel(edgeLabel, compact),
        });
      }
    });
  }

  const outbound = links.filter((l) => l.direction === "outbound");
  const inbound = links.filter((l) => l.direction === "inbound");

  const rightOutbound = outbound.filter((l) => !DATA_TECH_TYPES.has(l.objectType));
  const bottomOutbound = outbound.filter((l) => DATA_TECH_TYPES.has(l.objectType));
  const fromFlows = flowLinks.filter((f) => f.centerRole === "from");
  const rightColumnCount = rightOutbound.length + fromFlows.length;
  const rightPositions = autoColumn(
    Math.max(rightColumnCount, 1),
    RIGHT_X,
    CENTER_Y - ((Math.max(rightColumnCount, 1) - 1) * step) / 2,
    step
  );

  addLinkedNodes(
    rightOutbound,
    rightPositions.slice(0, rightOutbound.length),
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

  let rightSlot = rightOutbound.length;

  for (const flowLink of fromFlows) {
    const flow = flowById.get(flowLink.flowId);
    if (!flow) continue;
    const nodeId = systemDiagramFlowNodeId(flowLink.flowId);
    const position = rightPositions[rightSlot] ?? rightPositions[rightPositions.length - 1] ?? { x: RIGHT_X, y: 0 };
    rightSlot += 1;

    nodes.push({
      id: nodeId,
      type: "systemFlowNode",
      position: pos(nodeId, flowLink.flowId, position),
      data: { flow },
    });

    const style = flowEdgeStyle(flowLink.mechanism, compact);
    edges.push({
      id: `e-${nodeId}-from-center`,
      source: "system-center",
      sourceHandle: "right",
      target: nodeId,
      targetHandle: "left",
      type: "smoothstep",
      style,
      markerEnd: flowMarker,
      ...withEdgeLabel("sends", compact),
    });

    if (flowLink.peer) {
      const peerNodeId = ensurePeerNode(flowLink.peer, {
        x: PEER_X,
        y: position.y,
      });
      edges.push({
        id: `e-${nodeId}-to-peer`,
        source: nodeId,
        sourceHandle: "right",
        target: peerNodeId,
        targetHandle: "left",
        type: "smoothstep",
        style,
        markerEnd: flowMarker,
        ...withEdgeLabel("updates", compact),
      });
    }
  }

  const inboundFlowCount = flowLinks.filter((f) => f.centerRole === "to").length;
  const leftFlowPositions = autoColumn(
    Math.max(inboundFlowCount, 1),
    FLOW_PEER_LEFT_X,
    CENTER_Y - ((Math.max(inboundFlowCount, 1) - 1) * step) / 2,
    step
  );

  flowLinks
    .filter((f) => f.centerRole === "to")
    .forEach((flowLink, i) => {
      const flow = flowById.get(flowLink.flowId);
      if (!flow) return;
      const nodeId = systemDiagramFlowNodeId(flowLink.flowId);
      const position = leftFlowPositions[i] ?? leftFlowPositions[leftFlowPositions.length - 1] ?? {
        x: FLOW_PEER_LEFT_X,
        y: 0,
      };

      nodes.push({
        id: nodeId,
        type: "systemFlowNode",
        position: pos(nodeId, flowLink.flowId, position),
        data: { flow },
      });

      const style = flowEdgeStyle(flowLink.mechanism, compact);

      if (flowLink.peer) {
        const peerNodeId = ensurePeerNode(flowLink.peer, {
          x: LEFT_X,
          y: position.y,
        });
        edges.push({
          id: `e-${peerNodeId}-to-${nodeId}`,
          source: peerNodeId,
          sourceHandle: "right",
          target: nodeId,
          targetHandle: "left",
          type: "smoothstep",
          style,
          markerEnd: flowMarker,
          ...withEdgeLabel("sends", compact),
        });
      }

      edges.push({
        id: `e-${nodeId}-to-center`,
        source: nodeId,
        sourceHandle: "right",
        target: "system-center",
        targetHandle: "left-in",
        type: "smoothstep",
        style,
        markerEnd: flowMarker,
        ...withEdgeLabel("updates", compact),
      });
    });

  return { nodes, edges };
}

interface GraphProps {
  system: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  flows?: MinEAObject[];
  className?: string;
  compact?: boolean;
  accentColor?: string;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  exportFilename?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Catalog records: turns on "+N" badges and one-hop expansion around `expanded`. */
  expansion?: { objects: MinEAObject[]; expanded?: string[]; selectedId?: string | null };
  /** A node was clicked: the record it stands for ("+N more" reports its parent), and the node. */
  onNodeClick?: (objectId: string | null, node: Node) => void;
}

export function SystemArchitectureGraph({
  system,
  relationships,
  nameById,
  flows = [],
  className,
  compact,
  accentColor = APPLICATION_LAYER_COLOR,
  onLayoutSave,
  onResetLayout,
  exportFilename,
  containerRef,
  expansion,
  onNodeClick,
}: GraphProps) {
  const props = (system.properties ?? {}) as ApplicationProperties;
  const savedLayout = props.node_layout;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);

  const { nodes, edges } = useMemo(() => {
    const base = buildSystemGraph(
      system,
      relationships,
      nameById,
      flows,
      compact,
      compact ? undefined : savedLayout,
      accentColor
    );
    if (!expansion) return base;
    return expandSystemGraph(base, {
      expanded: compact ? [] : (expansion.expanded ?? []),
      relationships,
      objects: expansion.objects,
      selectedId: compact ? null : expansion.selectedId,
    });
  }, [system, relationships, nameById, flows, compact, savedLayout, accentColor, expansion]);

  return (
    <div className={cn("relative overflow-hidden", compact ? "h-[160px]" : "h-full", className)}>
      <EntityFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={compact ? SYSTEM_NODE_TYPES_COMPACT : SYSTEM_NODE_TYPES}
        mode={compact ? "thumbnail" : "full"}
        accentColor={accentColor}
        fitViewPadding={compact ? 0.1 : 0.2}
        onLayoutSave={compact ? undefined : onLayoutSave}
        onResetLayout={compact ? undefined : onResetLayout}
        hasCustomLayout={hasCustomLayout}
        exportFilename={compact ? undefined : exportFilename}
        containerRef={containerRef}
        onNodeClick={
          onNodeClick
            ? (_event, node) =>
                onNodeClick(node.type === "systemMoreNode" ? String(node.data?.parentObjectId ?? "") || null : nodeObjectId(node), node)
            : undefined
        }
        emptyLabel="Add connections to see the relationship map"
        className={cn("h-full rounded-lg border border-gray-200", compact && "rounded-none border-0")}
      />
    </div>
  );
}

export function SystemDiagramModal({
  system,
  relationships,
  flows = [],
  onClose,
  onLayoutSave,
  onResetLayout,
  onAddConnection,
  accentColor = APPLICATION_LAYER_COLOR,
  heading = "System relationships",
  footerHint = "Drag nodes to rearrange — positions save automatically. Use Add connection to link systems, components, data objects, and technology.",
  objects,
  initialExpandedId,
}: {
  system: MinEAObject;
  relationships: Relationship[];
  flows?: MinEAObject[];
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void | Promise<void>;
  onResetLayout?: () => void | Promise<void>;
  onAddConnection?: () => void;
  accentColor?: string;
  heading?: string;
  footerHint?: string;
  /** Catalog records: lets a click expand a node one hop and show its card. */
  objects?: MinEAObject[];
  /** Open with this record already expanded (a node clicked on the small map). */
  initialExpandedId?: string | null;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const [expanded, setExpanded] = useState<string[]>(() => (initialExpandedId ? [initialExpandedId] : []));
  const [selectedId, setSelectedId] = useState<string | null>(initialExpandedId ?? null);
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
    const map: Record<string, string> = {};
    for (const object of objects ?? []) map[object.id] = object.name;
    map[system.id] = system.name;
    for (const query of nameQueries) {
      if (query.data) map[query.data.id] = query.data.name;
    }
    return map;
  }, [nameQueries, system.id, system.name, objects]);

  const expansion = useMemo(
    () => (objects ? { objects, expanded, selectedId } : undefined),
    [objects, expanded, selectedId]
  );
  const handleNodeClick = (objectId: string | null, node: Node) => {
    if (!objectId) return;
    setSelectedId(objectId);
    if (node.type === "systemMoreNode" || objectId === system.id) return;
    setExpanded((prev) => (prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId]));
  };
  const toggle = (objectId: string) =>
    setExpanded((prev) => (prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId]));

  const props = (liveSystem.properties ?? {}) as ApplicationProperties;
  const linkCount =
    extractSystemDiagramLinks(liveSystem.id, relationships, nameById).length +
    extractSystemDiagramFlows(liveSystem.id, flows).length;
  const hasCustomLayout = !!(props.node_layout && Object.keys(props.node_layout).length > 0);

  const handleLayoutSave = async (all: NodeLayout) => {
    const layout = savableLayout(all);
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
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
              style={{ color: accentColor }}
            >
              {heading}
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ color: accentColor, backgroundColor: `${accentColor}14` }}
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
            flows={flows}
            accentColor={accentColor}
            onLayoutSave={handleLayoutSave}
            onResetLayout={handleResetLayout}
            exportFilename={liveSystem.name}
            containerRef={canvasRef}
            expansion={expansion}
            onNodeClick={objects ? handleNodeClick : undefined}
          />
          {objects && selectedId && selectedId !== system.id && (
            <MapNodeCard
              object={objects.find((item) => item.id === selectedId) ?? null}
              relationships={relationships}
              objects={objects}
              expanded={expanded.includes(selectedId)}
              onToggle={() => toggle(selectedId)}
              onClose={() => setSelectedId(null)}
              basePath={basePath}
            />
          )}
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex items-center gap-4 flex-wrap">
          <p className="text-xs text-gray-400">{footerHint}</p>
          {hasCustomLayout && (
            <span className="text-[10px] font-medium ml-auto" style={{ color: accentColor }}>
              Layout saved ✓
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/** The clicked record: what it links to (first few), Expand/Collapse in place, Open its page. */
export function MapNodeCard({
  object,
  relationships,
  objects,
  expanded,
  onToggle,
  onClose,
  basePath,
}: {
  object: MinEAObject | null;
  relationships: Relationship[];
  objects: MinEAObject[];
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  basePath: string;
}) {
  if (!object) return null;
  const neighbors = mapNeighbors(object.id, relationships, new Map(objects.map((item) => [item.id, item])));
  const href = objectOpenHref(basePath, object);
  const shown = neighbors.slice(0, PER_NODE_CAP);
  const more = neighbors.length - shown.length;
  return (
    <div data-testid="map-node-card" className="absolute left-3 top-14 z-10 w-64 rounded-xl border border-gray-200 bg-white p-3.5 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{object.name}</p>
          <p className="text-[11px] text-gray-500">{uiTypeLabel(object.type, true)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-gray-400 hover:bg-gray-100" aria-label="Close card">
          <X size={14} />
        </button>
      </div>
      <p className="mb-1 mt-3 text-[10px] font-semibold tracking-[0.12em] text-gray-400">CONNECTS TO</p>
      {neighbors.length === 0 ? (
        <p className="text-xs text-gray-500">No other links.</p>
      ) : (
        <ul className="space-y-0.5 text-xs text-gray-700">
          {shown.map((item) => (
            <li key={item.objectId} className="truncate">
              {item.name} <span className="text-gray-400">· {item.phrase.toLowerCase()}</span>
            </li>
          ))}
          {more > 0 && <li className="text-indigo-700">+{more} more</li>}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        {neighbors.length > 0 && (
          <button type="button" onClick={onToggle} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50">
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
        {href && (
          <a href={href} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
            Open
          </a>
        )}
      </div>
    </div>
  );
}
