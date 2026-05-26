"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ProductGraphNode, ProductGraphResponse } from "@minea/types";
import { getLayerColor, getTypeLayer } from "@/lib/utils";
import { cn } from "@/lib/utils";

const LAYER_LABELS: Record<number, string> = {
  0: "Product",
  1: "Capabilities",
  2: "Systems",
  3: "Dependencies",
};

function GraphNodeCard({ data, compact }: { data: ProductGraphNode; compact?: boolean }) {
  const color =
    data.type === "product"
      ? "#6366f1"
      : getLayerColor(getTypeLayer(data.type as never));

  if (compact) {
    return (
      <div
        className="rounded-md border bg-white px-1.5 py-1 min-w-[72px] max-w-[88px]"
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
      className="rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[160px] max-w-[200px]"
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
            {data.type.replace(/_/g, " ")}
          </p>
        </div>
      </div>
    </div>
  );
}

function layoutGraph(graph: ProductGraphResponse, compact?: boolean): { nodes: Node[]; edges: Edge[] } {
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
      nodes.push({
        id: node.id,
        type: compact ? "graphNodeCompact" : "graphNode",
        position: { x: layerX + layer * layerGap, y: startY + index * nodeHeight },
        data: node,
        draggable: false,
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
}

export function ProductArchitectureGraph({ productName, graph, className, compact }: Props) {
  const { nodes, edges } = useMemo(() => layoutGraph(graph, compact), [graph, compact]);
  const nodeTypes = useMemo(
    () => ({
      graphNode: ({ data }: { data: ProductGraphNode }) => (
        <GraphNodeCard data={data} compact={false} />
      ),
      graphNodeCompact: ({ data }: { data: ProductGraphNode }) => (
        <GraphNodeCard data={data} compact />
      ),
    }),
    []
  );

  const layersPresent = [...new Set(graph.nodes.map((n) => n.layer))].sort();

  if (graph.nodes.length <= 1) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200",
          compact ? "h-[160px]" : "h-full",
          className
        )}
      >
        <div className="text-center px-4">
          <p className={cn("font-medium text-gray-700 mb-1", compact ? "text-xs" : "text-sm")}>
            No architecture to show yet
          </p>
          {!compact && (
            <p className="text-xs text-gray-400 max-w-xs">
              Map business capabilities to this product and link systems in the repository to see
              the dependency graph.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative bg-[#fafafa] rounded-lg border border-gray-200 overflow-hidden",
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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: compact ? 0.08 : 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={!compact}
        panOnScroll={!compact}
        zoomOnScroll={!compact}
        zoomOnPinch={!compact}
        zoomOnDoubleClick={false}
        preventScrolling={compact}
        minZoom={compact ? 0.2 : 0.4}
        maxZoom={compact ? 1 : 1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={compact ? 12 : 20} size={1} color="#e5e7eb" />
        {!compact && (
          <>
            <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-sm" />
            <MiniMap
              nodeColor={(n) => {
                const d = n.data as ProductGraphNode;
                return d.type === "product"
                  ? "#6366f1"
                  : getLayerColor(
                      getTypeLayer(d.type as never)
                    );
              }}
              maskColor="rgba(255,255,255,0.7)"
              className="!bg-white !border-gray-200"
            />
          </>
        )}
      </ReactFlow>

      {!compact && (
        <div className="absolute bottom-3 left-3 text-[10px] text-gray-400 bg-white/90 border border-gray-200 rounded px-2 py-1">
          {graph.nodes.length} nodes · {graph.edges.length} relationships · {productName}
        </div>
      )}
    </div>
  );
}
