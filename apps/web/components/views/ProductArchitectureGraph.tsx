"use client";

import { memo, useMemo } from "react";
import { Handle, MarkerType, Position, type Edge, type Node, type NodeTypes } from "reactflow";
import type { ProductGraphNode, ProductGraphResponse } from "@minea/types";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";
import { getLayerColor, getTypeLayer } from "@/lib/utils";
import { cn } from "@/lib/utils";

const LAYER_LABELS: Record<number, string> = {
  0: "Product",
  1: "Capabilities",
  2: "Systems",
  3: "Dependencies",
};

function GraphNodeCard({
  data,
  compact,
}: {
  data: ProductGraphNode & { sharedCount?: number };
  compact?: boolean;
}) {
  const color =
    data.type === "product" ? "#6366f1" : getLayerColor(getTypeLayer(data.type as never));
  const shared = (data.sharedCount ?? 0) > 1;

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-md border bg-white px-1.5 py-1 min-w-[72px] max-w-[88px] relative",
          shared && "ring-1 ring-amber-300"
        )}
        style={{ borderColor: `${color}66` }}
      >
        <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
        <div className="flex items-center gap-1">
          <div
            className="h-4 w-4 rounded flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {data.label.charAt(0).toUpperCase()}
          </div>
          <p className="text-[9px] font-medium text-gray-800 truncate leading-tight">{data.label}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[160px] max-w-[200px] relative",
        shared && "ring-1 ring-amber-300"
      )}
      style={{ borderColor: `${color}55` }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {data.label.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{data.label}</p>
          <p className="text-[10px] text-gray-400 capitalize truncate">
            {shared
              ? `Shared · ${data.sharedCount} products`
              : data.type.replace(/_/g, " ")}
          </p>
        </div>
      </div>
    </div>
  );
}

const GraphNode = memo(({ data }: { data: ProductGraphNode }) => (
  <GraphNodeCard data={data} compact={false} />
));
GraphNode.displayName = "GraphNode";

const GraphNodeCompact = memo(({ data }: { data: ProductGraphNode }) => (
  <GraphNodeCard data={data} compact />
));
GraphNodeCompact.displayName = "GraphNodeCompact";

export const PRODUCT_GRAPH_NODE_TYPES: NodeTypes = {
  graphNode: GraphNode,
  graphNodeCompact: GraphNodeCompact,
};

export function buildProductArchitectureGraph(
  graph: ProductGraphResponse,
  compact?: boolean,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const layerX = compact ? 20 : 60;
  const layerGap = compact ? 110 : 260;
  const nodeHeight = compact ? 36 : 72;

  const byLayer = new Map<number, ProductGraphNode[]>();
  for (const node of graph.nodes) {
    (byLayer.get(node.layer) ?? byLayer.set(node.layer, []).get(node.layer)!).push(node);
  }

  const nodes: Node[] = [];
  for (const [layer, layerNodes] of [...byLayer.entries()].sort(([a], [b]) => a - b)) {
    const totalHeight = layerNodes.length * nodeHeight;
    const startY = Math.max(compact ? 12 : 40, (compact ? 90 : 220) - totalHeight / 2);
    layerNodes.forEach((node, index) => {
      const autoPos = { x: layerX + layer * layerGap, y: startY + index * nodeHeight };
      nodes.push({
        id: node.id,
        type: compact ? "graphNodeCompact" : "graphNode",
        position: compact ? autoPos : (savedLayout?.[node.id] ?? autoPos),
        data: node,
      });
    });
  }

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: compact ? undefined : edge.label,
    type: "smoothstep",
    animated: false,
    markerEnd: compact
      ? undefined
      : { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#94a3b8" },
    style: { stroke: "#cbd5e1", strokeWidth: compact ? 1 : 1.5 },
    labelStyle: compact ? undefined : { fill: "#64748b", fontSize: 10, fontWeight: 500 },
    labelBgStyle: compact ? undefined : { fill: "#f8fafc", fillOpacity: 0.9 },
    labelBgPadding: compact ? undefined : ([4, 2] as [number, number]),
    labelBgBorderRadius: compact ? undefined : 4,
  }));

  return { nodes, edges };
}

interface Props {
  productName: string;
  graph: ProductGraphResponse;
  className?: string;
  compact?: boolean;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
}

export function ProductArchitectureGraph({
  productName,
  graph,
  className,
  compact,
  onLayoutSave,
  onResetLayout,
}: Props) {
  const savedLayout = graph.graph_layout ?? undefined;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);

  const { nodes, edges } = useMemo(
    () => buildProductArchitectureGraph(graph, compact, compact ? undefined : savedLayout),
    [graph, compact, savedLayout]
  );

  const layersPresent = [...new Set(graph.nodes.map((n) => n.layer))].sort();

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        compact ? "h-[160px]" : "h-full",
        className
      )}
    >
      {!compact && (
        <div className="absolute top-3 left-0 right-0 z-10 flex pointer-events-none px-4">
          {layersPresent.map((layer) => (
            <div
              key={layer}
              className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
              style={{ marginLeft: layer === layersPresent[0] ? 60 : 220 }}
            >
              {LAYER_LABELS[layer] ?? `Layer ${layer}`}
            </div>
          ))}
        </div>
      )}

      <EntityFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={PRODUCT_GRAPH_NODE_TYPES}
        mode={compact ? "thumbnail" : "full"}
        accentColor="#6366f1"
        fitViewPadding={compact ? 0.08 : 0.2}
        onLayoutSave={compact ? undefined : onLayoutSave}
        onResetLayout={compact ? undefined : onResetLayout}
        hasCustomLayout={hasCustomLayout}
        emptyLabel="No architecture to show yet — map capabilities and link systems to see the graph"
        className={cn("h-full rounded-lg border border-gray-200", compact && "rounded-none border-0")}
      />

      {!compact && graph.nodes.length > 1 && (
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none text-[10px] text-gray-400 bg-white/90 border border-gray-200 rounded px-2 py-1">
          {graph.nodes.length} nodes · {graph.edges.length} relationships · {productName}
          {hasCustomLayout && <span className="text-indigo-500 ml-1">· layout saved</span>}
        </div>
      )}
    </div>
  );
}
