"use client";

import { useEffect, useMemo, useRef } from "react";
import { RefreshCw, X } from "lucide-react";
import type { AiInsight } from "@minea/types";
import { cn } from "@/lib/utils";

function formatAnalysedAgo(iso: string | null): string {
  if (!iso) return "not yet analysed";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function severityStyle(severity: AiInsight["severity"]) {
  switch (severity) {
    case "high":
      return { dot: "bg-red-500" };
    case "medium":
      return { dot: "bg-amber-500" };
    default:
      return { dot: "bg-blue-400" };
  }
}

function InsightItem({ insight }: { insight: AiInsight }) {
  const style = severityStyle(insight.severity);
  const examples = insight.examples ?? [];
  const note = insight.impact_note || insight.description;

  return (
    <div className="px-5 py-4 border-b border-gray-100 hover:bg-stone-50/60 transition-colors">
      <div className="flex items-start gap-3">
        <span className={cn("h-2 w-2 rounded-full mt-1.5 flex-shrink-0", style.dot)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{insight.title}</p>
          {examples.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">{examples.join(" · ")}</p>
          )}
          {note && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{note}</p>}
        </div>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  insights: AiInsight[];
  count: number;
  analysedAt: string | null;
  isLoading: boolean;
  isGenerating: boolean;
  onRefresh: () => void;
}

export function ArchitectureInsightsPanel({
  open,
  onClose,
  insights,
  count,
  analysedAt,
  isLoading,
  isGenerating,
  onRefresh,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const { criticalCount, warningCount } = useMemo(
    () => ({
      criticalCount: insights.filter((i) => i.severity === "high").length,
      warningCount: insights.filter((i) => i.severity === "medium").length,
    }),
    [insights]
  );

  if (!open) return null;

  const busy = isLoading || isGenerating;

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/20" onClick={onClose} />
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-full max-w-[400px] bg-white shadow-2xl z-[210] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Architecture insights</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {count} gap{count === 1 ? "" : "s"} detected · analysed {formatAnalysedAgo(analysedAt)}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isGenerating}
              title="Re-analyse architecture"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={isGenerating ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {busy ? (
            <p className="px-5 py-8 text-sm text-gray-400">Analysing architecture…</p>
          ) : insights.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-500 mb-1">No gaps detected</p>
              <p className="text-xs text-gray-400">Your architecture model looks complete.</p>
            </div>
          ) : (
            insights.map((insight) => <InsightItem key={insight.id} insight={insight} />)
          )}
        </div>

        {(criticalCount > 0 || warningCount > 0) && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3 text-[11px] text-gray-500 flex-shrink-0">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {warningCount} warning{warningCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
