"use client";

/**
 * EntityFlowCanvas — reusable React Flow canvas used across minEA for any
 * entity relationship diagram. Provides:
 *   • thumbnail mode (static, non-interactive, no overhead)
 *   • full mode (draggable nodes, pan/zoom, MiniMap, Controls)
 *   • debounced auto-save of node positions (600 ms after last drag)
 *   • "Reset layout" toolbar button to clear saved positions
 *
 * Usage:
 *   const { nodes, edges } = useMemo(() => buildMyGraph(data, savedLayout), [data, savedLayout]);
 *   <EntityFlowCanvas
 *     nodes={nodes} edges={edges} nodeTypes={MY_NODE_TYPES}
 *     mode="full"
 *     onLayoutSave={(layout) => saveToBackend(layout)}
 *     onResetLayout={() => saveToBackend({})}
 *   />
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { DiagramExportButton } from "@/components/shared/DiagramExportButton";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeDragHandler,
  type NodeMouseHandler,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type NodeLayout = Record<string, { x: number; y: number }>;

export interface EntityFlowCanvasProps {
  /** Pre-positioned nodes. Apply savedLayout positions before passing here. */
  nodes: Node[];
  edges: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;

  /**
   * Called (debounced 600 ms) after user drags a node.
   * Layout contains ALL current node positions so the save is a full snapshot.
   */
  onLayoutSave?: (layout: NodeLayout) => void;

  /**
   * Called when user clicks "Reset layout".
   * Caller should clear savedLayout from backend (pass {} to onLayoutSave).
   */
  onResetLayout?: () => void;

  /**
   * Whether the canvas should be interactive (full) or frozen (thumbnail).
   * Defaults to "full".
   */
  mode?: "full" | "thumbnail";

  /** Text shown when there are no nodes (≤ 1). */
  emptyLabel?: string;

  /** Accent colour used for MiniMap node dots. */
  accentColor?: string;

  /** Extra CSS classes for the outer wrapper div. */
  className?: string;

  /** React Flow fitView padding. Defaults to 0.2. */
  fitViewPadding?: number;

  /** Whether a custom layout is currently active (shows Reset button). */
  hasCustomLayout?: boolean;

  /** When set, shows an Export PNG button (full mode only). */
  exportFilename?: string;

  /** Container element for PNG export capture. */
  containerRef?: RefObject<HTMLDivElement | null>;

  onNodeClick?: NodeMouseHandler;
}

// ─── Inner canvas (must be inside ReactFlowProvider) ──────────────────────────

function CanvasInner({
  nodes: initialNodes,
  edges: initialEdges,
  nodeTypes,
  edgeTypes,
  onLayoutSave,
  onResetLayout,
  mode = "full",
  accentColor = "#14b8a6",
  fitViewPadding = 0.2,
  hasCustomLayout = false,
  exportFilename,
  containerRef,
  onNodeClick,
}: Omit<EntityFlowCanvasProps, "className" | "emptyLabel">) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  // Tracks all current positions so each save is a full snapshot
  const layoutRef = useRef<NodeLayout>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed layout ref for new nodes only — never overwrite dragged positions
  useEffect(() => {
    for (const node of initialNodes) {
      if (!layoutRef.current[node.id]) {
        layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
      }
    }
  }, [initialNodes]);

  // Sync data changes without clobbering in-progress drags or saved layout
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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const scheduleSave = useCallback(() => {
    if (!onLayoutSave) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onLayoutSave({ ...layoutRef.current });
    }, 600);
  }, [onLayoutSave]);

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      layoutRef.current[node.id] = { x: node.position.x, y: node.position.y };
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleReset = useCallback(() => {
    if (onResetLayout) onResetLayout();
    layoutRef.current = {};
    // Let React Flow re-fit after reset; parent will rebuild nodes without saved layout
    setTimeout(() => fitView({ duration: 300, padding: fitViewPadding }), 50);
  }, [onResetLayout, fitView, fitViewPadding]);

  const interactive = mode === "full";

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={interactive ? handleNodeDragStop : undefined}
        onNodeClick={interactive ? onNodeClick : undefined}
        fitView
        fitViewOptions={{ padding: fitViewPadding }}
        nodesDraggable={interactive}
        nodesConnectable={false}
        elementsSelectable={interactive}
        panOnDrag={interactive}
        panOnScroll={false}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={false}
        preventScrolling={!interactive}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={interactive ? 18 : 12}
          size={1}
          color="#e5e7eb"
        />

        {interactive && (
          <>
            <Controls
              showInteractive={false}
              className="!bg-white !border-gray-200 !shadow-sm"
            />
            <MiniMap
              nodeColor={accentColor}
              maskColor="rgba(255,255,255,0.65)"
              className="!bg-white !border-gray-200 !shadow-sm"
              pannable
              zoomable
            />
          </>
        )}
      </ReactFlow>

      {/* Navigation hint */}
      {interactive && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="text-[10px] text-gray-400 bg-white/90 border border-gray-200 rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
            Drag nodes · Scroll to zoom · Click background to pan
          </span>
        </div>
      )}

      {interactive && exportFilename && (
        <DiagramExportButton
          filename={exportFilename}
          containerEl={containerRef?.current ?? null}
        />
      )}

      {interactive && onResetLayout && (
        <button
          type="button"
          onClick={handleReset}
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
      )}
    </div>
  );
}

// ─── Public component (handles provider + empty state) ────────────────────────

export function EntityFlowCanvas({
  nodes,
  edges,
  emptyLabel = "Nothing to show yet",
  className,
  mode = "full",
  containerRef: externalContainerRef,
  ...rest
}: EntityFlowCanvasProps) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef ?? internalContainerRef;
  const isEmpty = nodes.length === 0;

  if (isEmpty) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200",
          className
        )}
      >
        <p className="text-xs text-gray-400 italic">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative bg-[#fafafa] rounded-lg overflow-hidden", className ?? "w-full h-full")}
    >
      <ReactFlowProvider>
        <CanvasInner
          nodes={nodes}
          edges={edges}
          mode={mode}
          containerRef={containerRef}
          {...rest}
        />
      </ReactFlowProvider>
    </div>
  );
}
