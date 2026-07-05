"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "reactflow";
import { ArrowLeftRight, X } from "lucide-react";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { DiagramLinkedObjectNode } from "@/components/shared/DiagramNodes";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";

export type { NodeLayout };
import {
  extractInfraDiagramLinks,
  type InfraDiagramLink,
} from "@/lib/integration-infra-relationship-utils";
import { formatInfraSubtitle, INFRA_ICON_STYLE, TECHNOLOGY_LAYER_COLOR } from "@/lib/integration-infra-utils";
import { relationshipVerb } from "@/lib/relationship-display";
import type { MinEAObject, ObjectType, Relationship, ToolProperties } from "@minea/types";
import { cn } from "@/lib/utils";

const ARCH_REL_TYPES = new Set(["hosts", "routes", "carries"]);

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

function InfraCenterNode({
  data,
  compact,
}: {
  data: { infra: MinEAObject; subtitle: string };
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="bg-white border-2 border-teal-400 rounded-md overflow-hidden min-w-[72px] max-w-[88px]">
        <Handle type="source" position={Position.Right} id="right" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Left} id="left" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="!opacity-0 !w-1 !h-1" />
        <div className="h-1 bg-teal-500" />
        <p className="text-[8px] font-bold text-gray-900 px-1 py-1 truncate text-center">{data.infra.name}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl border-2 border-teal-400 overflow-hidden w-[220px]">
      <Handle type="source" position={Position.Right} id="right" style={{ background: TECHNOLOGY_LAYER_COLOR }} />
      <Handle type="source" position={Position.Left} id="left" style={{ background: TECHNOLOGY_LAYER_COLOR }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: TECHNOLOGY_LAYER_COLOR }} />
      <Handle type="target" position={Position.Top} id="top" style={{ background: TECHNOLOGY_LAYER_COLOR }} />
      <div className="h-1 bg-teal-500" />
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-6 w-6 rounded flex items-center justify-center flex-shrink-0", INFRA_ICON_STYLE)}>
            <ArrowLeftRight size={12} />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{data.infra.name}</p>
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
  data: { link: InfraDiagramLink };
  compact?: boolean;
}) {
  return (
    <DiagramLinkedObjectNode
      name={data.link.name}
      objectType={data.link.objectType}
      compact={compact}
      handleColor={TECHNOLOGY_LAYER_COLOR}
    />
  );
}

const InfraCenterNodeFull = memo((props: NodeProps) => <InfraCenterNode data={props.data} />);
InfraCenterNodeFull.displayName = "InfraCenterNodeFull";
const InfraCenterNodeCompact = memo((props: NodeProps) => (
  <InfraCenterNode data={props.data} compact />
));
InfraCenterNodeCompact.displayName = "InfraCenterNodeCompact";
const LinkedObjectNodeFull = memo((props: NodeProps) => <LinkedObjectNode data={props.data} />);
LinkedObjectNodeFull.displayName = "LinkedObjectNodeFull";
const LinkedObjectNodeCompact = memo((props: NodeProps) => (
  <LinkedObjectNode data={props.data} compact />
));
LinkedObjectNodeCompact.displayName = "LinkedObjectNodeCompact";

export const INFRA_NODE_TYPES: NodeTypes = {
  infraCenterNode: InfraCenterNodeFull,
  infraLinkedNode: LinkedObjectNodeFull,
};

export const INFRA_NODE_TYPES_COMPACT: NodeTypes = {
  infraCenterNode: InfraCenterNodeCompact,
  infraLinkedNode: LinkedObjectNodeCompact,
};

function autoColumn(count: number, x: number, startY: number, step: number) {
  return Array.from({ length: Math.max(count, 0) }, (_, i) => ({
    x,
    y: startY + i * step,
  }));
}

export function buildInfraGraph(
  infra: MinEAObject,
  relationships: Relationship[],
  nameById: Record<string, string>,
  compact?: boolean,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const props = (infra.properties ?? {}) as ToolProperties;
  const links = extractInfraDiagramLinks(infra.id, relationships, nameById);

  const apis = links.filter((l) => l.relationshipType === "hosts");
  const events = links.filter((l) => l.relationshipType === "routes");
  const flows = links.filter((l) => l.relationshipType === "carries");
  const other = links.filter((l) => !ARCH_REL_TYPES.has(l.relationshipType));

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

  const nodes: Node[] = [
    {
      id: "infra-center",
      type: "infraCenterNode",
      position: pos("infra-center", { x: CENTER_X, y: CENTER_Y }),
      data: { infra, subtitle: formatInfraSubtitle(props) },
    },
  ];
  const edges: Edge[] = [];

  const marker = compact
    ? undefined
    : { type: MarkerType.ArrowClosed, color: TECHNOLOGY_LAYER_COLOR, width: 12, height: 12 };

  function addLinkedNodes(
    group: InfraDiagramLink[],
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
        type: "infraLinkedNode",
        position: pos(nodeId, auto),
        data: { link },
      });

      const shortLabel = relationshipVerb(link.relationshipType);
      if (outbound) {
        edges.push({
          id: `e-${nodeId}-out`,
          source: "infra-center",
          sourceHandle,
          target: nodeId,
          targetHandle: "left",
          type: "smoothstep",
          style: { stroke: TECHNOLOGY_LAYER_COLOR, strokeWidth: compact ? 1 : 1.5 },
          markerEnd: marker,
          ...withEdgeLabel(shortLabel, compact),
        });
      } else {
        edges.push({
          id: `e-${nodeId}-in`,
          source: nodeId,
          sourceHandle: "right",
          target: "infra-center",
          targetHandle: "top",
          type: "smoothstep",
          style: { stroke: "#94a3b8", strokeWidth: compact ? 1 : 1.5 },
          markerEnd: marker,
          ...withEdgeLabel(shortLabel, compact),
        });
      }
    });
  }

  const apiOutbound = apis.filter((l) => l.direction === "outbound");
  const apiInbound = apis.filter((l) => l.direction === "inbound");
  const eventOutbound = events.filter((l) => l.direction === "outbound");
  const eventInbound = events.filter((l) => l.direction === "inbound");
  const flowOutbound = flows.filter((l) => l.direction === "outbound");
  const flowInbound = flows.filter((l) => l.direction === "inbound");
  const otherOutbound = other.filter((l) => l.direction === "outbound");
  const otherInbound = other.filter((l) => l.direction === "inbound");

  addLinkedNodes(
    apiOutbound,
    autoColumn(apiOutbound.length, RIGHT_X, CENTER_Y - ((apiOutbound.length - 1) * step) / 2, step),
    "right",
    "left",
    true
  );
  addLinkedNodes(
    apiInbound,
    autoColumn(apiInbound.length, LEFT_X, CENTER_Y - ((apiInbound.length - 1) * step) / 2, step),
    "left",
    "right",
    false
  );

  const bottomOutbound = [...eventOutbound, ...flowOutbound];
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

  const leftOther = [...otherInbound, ...otherOutbound, ...eventInbound, ...flowInbound];
  addLinkedNodes(
    leftOther,
    autoColumn(leftOther.length, LEFT_X, CENTER_Y + 60 - ((leftOther.length - 1) * step) / 2, step),
    "left",
    "right",
    false
  );

  return { nodes, edges };
}

interface GraphProps {
  infra: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  className?: string;
  compact?: boolean;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  exportFilename?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function IntegrationInfraArchitectureGraph({
  infra,
  relationships,
  nameById,
  className,
  compact,
  onLayoutSave,
  onResetLayout,
  exportFilename,
  containerRef,
}: GraphProps) {
  const props = (infra.properties ?? {}) as ToolProperties;
  const savedLayout = props.node_layout;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);

  const { nodes, edges } = useMemo(
    () => buildInfraGraph(infra, relationships, nameById, compact, compact ? undefined : savedLayout),
    [infra, relationships, nameById, compact, savedLayout]
  );

  return (
    <div className={cn("relative overflow-hidden", compact ? "h-[160px]" : "h-full", className)}>
      <EntityFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={compact ? INFRA_NODE_TYPES_COMPACT : INFRA_NODE_TYPES}
        mode={compact ? "thumbnail" : "full"}
        accentColor={TECHNOLOGY_LAYER_COLOR}
        fitViewPadding={compact ? 0.1 : 0.2}
        onLayoutSave={compact ? undefined : onLayoutSave}
        onResetLayout={compact ? undefined : onResetLayout}
        hasCustomLayout={hasCustomLayout}
        exportFilename={compact ? undefined : exportFilename}
        containerRef={containerRef}
        emptyLabel="No linked APIs, events, or flows yet"
        className={cn("h-full rounded-lg border border-gray-200", compact && "rounded-none border-0")}
      />
    </div>
  );
}

export function IntegrationInfraDiagramModal({
  infra,
  relationships,
  nameById,
  onClose,
  onLayoutSave,
  onResetLayout,
}: {
  infra: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [liveInfra, setLiveInfra] = useState(infra);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    setLiveInfra(infra);
  }, [infra]);

  const props = (liveInfra.properties ?? {}) as ToolProperties;
  const linkCount = extractInfraDiagramLinks(liveInfra.id, relationships, nameById).length;
  const hasCustomLayout = !!(props.node_layout && Object.keys(props.node_layout).length > 0);

  const handleLayoutSave = async (layout: NodeLayout) => {
    const currentProps = (liveInfra.properties ?? {}) as ToolProperties;
    setLiveInfra({
      ...liveInfra,
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
    const currentProps = (liveInfra.properties ?? {}) as ToolProperties;
    setLiveInfra({
      ...liveInfra,
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
            <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-0.5">
              Integration infrastructure
            </p>
            <h2 className="text-base font-bold text-gray-900">{liveInfra.name}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {formatInfraSubtitle(props)}
              {linkCount > 0 ? ` · ${linkCount} connection${linkCount !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={canvasRef} className="flex-1 relative min-h-0">
          <IntegrationInfraArchitectureGraph
            infra={liveInfra}
            relationships={relationships}
            nameById={nameById}
            onLayoutSave={handleLayoutSave}
            onResetLayout={handleResetLayout}
            exportFilename={liveInfra.name}
            containerRef={canvasRef}
          />
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex items-center gap-4 flex-wrap">
          <p className="text-xs text-gray-400">
            Drag nodes to rearrange — positions save automatically. Link objects from API, Event, or Flow
            edit forms.
          </p>
          {hasCustomLayout && (
            <span className="text-[10px] text-teal-600 font-medium ml-auto">Layout saved ✓</span>
          )}
        </div>
      </div>
    </>
  );
}
