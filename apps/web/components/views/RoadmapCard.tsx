"use client";

import { AlertCircle, Clock, MapPin } from "lucide-react";
import type { RoadmapCardModel } from "@/lib/roadmap-utils";
import { ROADMAP_MILESTONE_SEGMENT, STRATEGY_LAYER_COLOR } from "@/lib/roadmap-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

interface Props {
  model: RoadmapCardModel;
  onClick: () => void;
}

function MetricCol({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}

function MilestoneProgressBar({ segments }: { segments: { status: string }[] }) {
  if (segments.length === 0) return null;
  return (
    <div className="flex gap-1">
      {segments.map((seg, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            ROADMAP_MILESTONE_SEGMENT[seg.status] ?? ROADMAP_MILESTONE_SEGMENT.not_started
          )}
        />
      ))}
    </div>
  );
}

export function RoadmapCard({ model, onClick }: Props) {
  const next = model.nextMilestone;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-violet-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${STRATEGY_LAYER_COLOR}22`, color: STRATEGY_LAYER_COLOR }}
        >
          <MapPin size={18} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">{model.name}</h3>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
              {model.kindLabel}
            </span>
            <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {model.statusLabel}
            </span>
          </div>
        </div>
      </div>

      {model.subtitle && (
        <p className="text-xs text-gray-500 mt-3 truncate">{model.subtitle}</p>
      )}

      <div className="flex gap-3 mt-3">
        <MetricCol label="Spend" value={model.spendLabel} />
        <MetricCol label="Target" value={model.targetLabel} />
        <MetricCol label="Effort" value={model.effortLabel} />
      </div>

      {model.resolvesDebtCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 mt-3">
          <AlertCircle size={14} className="flex-shrink-0" />
          Resolves {model.resolvesDebtCount} debt item{model.resolvesDebtCount === 1 ? "" : "s"}
        </p>
      )}

      {model.milestonesTotal > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Milestones · {model.milestonesDone} of {model.milestonesTotal} done
          </p>
          <MilestoneProgressBar segments={model.milestoneStrip} />
          {next && (
            <p className="text-xs text-gray-500">
              Next: <span className="font-medium text-gray-700">{next.title}</span>
              {next.target_label ? ` · ${next.target_label}` : ""}
            </p>
          )}
        </div>
      )}

      {model.updatedAt && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
          <Clock size={12} className="flex-shrink-0" />
          <span>
            Updated
            {model.updatedByName ? (
              <>
                {" "}
                by <span className="font-semibold text-gray-600">{model.updatedByName}</span>
              </>
            ) : null}{" "}
            {formatUpdatedAgo(model.updatedAt)}
          </span>
        </div>
      )}
    </button>
  );
}
