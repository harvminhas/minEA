"use client";

import { Maximize2 } from "lucide-react";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { FlowDiagramThumbnail } from "@/components/integration/FlowDiagram";
import { cn } from "@/lib/utils";

interface Props {
  flow: MinEAObject;
  onExpand: () => void;
  disabled?: boolean;
}

export function FlowDiagramPreview({ flow, onExpand, disabled }: Props) {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const srcCount =
    (props.sources?.systems.length ?? 0) + (props.sources?.entities.length ?? 0);
  const dstCount =
    (props.destinations?.systems.length ?? 0) + (props.destinations?.entities.length ?? 0);
  const hasEndpoints = srcCount > 0 || dstCount > 0;

  return (
    <button
      type="button"
      onClick={onExpand}
      disabled={disabled}
      className={cn(
        "group relative w-full text-left rounded-lg border border-gray-200 overflow-hidden",
        "hover:border-teal-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-500",
        disabled && "pointer-events-none opacity-80"
      )}
      aria-label="Expand flow chart"
    >
      {hasEndpoints ? (
        <div className="bg-gray-50/60 px-2 py-2">
          <FlowDiagramThumbnail flow={flow} />
        </div>
      ) : (
        <div className="h-[160px] bg-gray-50 flex items-center justify-center px-4">
          <p className="text-xs text-gray-400 text-center">
            Add source and destination systems to see the flow chart
          </p>
        </div>
      )}

      <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors pointer-events-none" />
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Maximize2 size={10} />
        Expand
      </div>
    </button>
  );
}
