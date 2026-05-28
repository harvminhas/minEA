"use client";

import { Maximize2 } from "lucide-react";
import type { ApiProperties, MinEAObject } from "@minea/types";
import { ApiArchitectureGraph } from "@/components/integration/ApiDiagram";
import { cn } from "@/lib/utils";

interface Props {
  api: MinEAObject;
  onExpand: () => void;
}

export function ApiDiagramPreview({ api, onExpand }: Props) {
  const props = (api.properties ?? {}) as ApiProperties;
  const hasProvider = !!props.provider;

  return (
    <button
      type="button"
      onClick={onExpand}
      className={cn(
        "group relative w-full text-left rounded-lg border border-gray-200 overflow-hidden",
        "hover:border-teal-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
      )}
      aria-label="Expand API architecture chart"
    >
      {hasProvider ? (
        <div className="bg-gray-50/60">
          <ApiArchitectureGraph api={api} compact />
        </div>
      ) : (
        <div className="h-[160px] bg-gray-50 flex items-center justify-center px-4">
          <p className="text-xs text-gray-400 text-center">
            Select a provider to see the API architecture diagram
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
