"use client";

import { useMemo, useRef } from "react";
import { Maximize2 } from "lucide-react";
import { SystemArchitectureGraph } from "@/components/application/SystemDiagram";
import { extractSystemDiagramFlows, extractSystemDiagramLinks } from "@/lib/system-relationship-utils";
import type { MinEAObject, Relationship } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  system: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  flows?: MinEAObject[];
  /** Opens the full map; with the record of the node that was clicked, when one was. */
  onExpand: (focusObjectId?: string) => void;
  disabled?: boolean;
  /** Catalog records: shows "+N" badges and lets a node click open the full map on that node. */
  objects?: MinEAObject[];
  accentColor?: string;
  emptyHint?: string;
}

export function SystemDiagramPreview({
  system,
  relationships,
  nameById,
  flows = [],
  onExpand,
  disabled,
  accentColor,
  emptyHint = "No linked objects yet. Expand to add systems, components, data objects, and technology.",
  objects,
}: Props) {
  // React Flow reports the node click first; the button's own click then opens the full map on it.
  const clickedNode = useRef<string | null>(null);
  const expansion = useMemo(() => (objects ? { objects } : undefined), [objects]);
  const hasLinks =
    extractSystemDiagramLinks(system.id, relationships, nameById).length > 0 ||
    extractSystemDiagramFlows(system.id, flows).length > 0;

  return (
    <button
      type="button"
      onClick={() => {
        const focus = clickedNode.current;
        clickedNode.current = null;
        onExpand(focus && focus !== system.id ? focus : undefined);
      }}
      disabled={disabled}
      className={cn(
        "group relative w-full text-left rounded-lg border border-gray-200 overflow-hidden",
        "hover:shadow-sm transition-all focus:outline-none focus:ring-2",
        accentColor === "#8b5cf6"
          ? "hover:border-violet-300 focus:ring-violet-500"
          : "hover:border-indigo-300 focus:ring-indigo-500",
        disabled && "pointer-events-none opacity-80"
      )}
      aria-label="Expand system relationship chart"
    >
      {hasLinks ? (
        <div className="bg-gray-50/60">
          <SystemArchitectureGraph
            system={system}
            relationships={relationships}
            nameById={nameById}
            flows={flows}
            compact
            accentColor={accentColor}
            expansion={expansion}
            onNodeClick={
              objects
                ? (objectId) => {
                    clickedNode.current = objectId;
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="h-[160px] bg-gray-50 flex items-center justify-center px-4">
          <p className="text-xs text-gray-400 text-center">{emptyHint}</p>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 transition-colors pointer-events-none opacity-0 group-hover:opacity-100",
          accentColor === "#8b5cf6" ? "bg-violet-600/5" : "bg-indigo-600/5"
        )}
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Maximize2 size={10} />
        Expand
      </div>
    </button>
  );
}
