"use client";

import { useState, type RefObject } from "react";
import { Download } from "lucide-react";
import { useReactFlow } from "reactflow";
import { runDiagramExport } from "@/lib/diagram-export-utils";
import { cn } from "@/lib/utils";

export function DiagramExportButton({
  filename,
  containerEl,
  containerRef,
  slugFallback = "diagram",
  filterNodes,
  emptyMessage = "Nothing to export yet.",
}: {
  filename: string;
  containerEl?: HTMLElement | null;
  containerRef?: RefObject<HTMLElement | null>;
  slugFallback?: string;
  filterNodes?: (nodes: ReturnType<ReturnType<typeof useReactFlow>["getNodes"]>) => ReturnType<ReturnType<typeof useReactFlow>["getNodes"]>;
  emptyMessage?: string;
}) {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);
    const allNodes = getNodes();
    const exportNodes = filterNodes ? filterNodes(allNodes) : allNodes;
    if (exportNodes.length === 0) {
      setExportError(emptyMessage);
      return;
    }

    const el = containerRef?.current ?? containerEl ?? null;
    setExporting(true);
    try {
      await runDiagramExport({
        containerEl: el,
        exportNodes,
        filename,
        slugFallback,
        onError: setExportError,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5 max-w-xs" data-export-ignore>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={exporting}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-sm border transition-colors",
          "bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400 disabled:opacity-50"
        )}
      >
        <Download size={12} />
        {exporting ? "Exporting…" : "Export PNG"}
      </button>
      {exportError && (
        <p className="text-[11px] leading-snug text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 shadow-sm">
          {exportError}
        </p>
      )}
    </div>
  );
}
