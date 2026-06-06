"use client";

import { Maximize2 } from "lucide-react";
import type { ComponentProperties, MinEAObject } from "@minea/types";
import { ComponentDiagramThumbnail } from "@/components/application/ComponentDiagram";
import { cn } from "@/lib/utils";

interface Props {
  component: MinEAObject;
  onExpand: () => void;
  disabled?: boolean;
}

export function ComponentDiagramPreview({ component, onExpand, disabled }: Props) {
  const props = (component.properties ?? {}) as ComponentProperties;
  const sysCount = props.systems?.length ?? 0;
  const hasContent = sysCount > 0 || !!props.runtime;

  return (
    <button
      type="button"
      onClick={onExpand}
      disabled={disabled}
      className={cn(
        "group relative w-full text-left rounded-lg border border-gray-200 overflow-hidden",
        "hover:border-indigo-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500",
        disabled && "pointer-events-none opacity-80"
      )}
      aria-label="Expand architecture chart"
    >
      {hasContent ? (
        <div className="bg-gray-50/60 px-2 py-2">
          <ComponentDiagramThumbnail component={component} />
        </div>
      ) : (
        <div className="h-[160px] bg-gray-50 flex items-center justify-center px-4">
          <p className="text-xs text-gray-400 text-center">
            Add systems and runtime to see the architecture diagram
          </p>
        </div>
      )}

      <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors pointer-events-none" />
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Maximize2 size={10} />
        Expand
      </div>
    </button>
  );
}
