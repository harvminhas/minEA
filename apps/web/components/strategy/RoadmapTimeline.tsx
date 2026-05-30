"use client";

import { useMemo, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import type { RoadmapItemProperties, RoadmapMilestone } from "@minea/types";
import {
  buildTimelineQuarters,
  milestoneDoneCount,
  milestonePosition,
  ROADMAP_MILESTONE_STATUS_LABEL,
  sortedMilestones,
  targetResolutionLabel,
  TIMELINE_SCROLL_QUARTER_THRESHOLD,
  timelinePositionPercent,
} from "@/lib/roadmap-utils";
import { cn } from "@/lib/utils";

type ViewMode = "quarter" | "month";

interface Props {
  properties: RoadmapItemProperties;
  milestones: RoadmapMilestone[];
  onAddAtQuarter: (quarter: string) => void;
  onEditMilestone: (milestone: RoadmapMilestone) => void;
}

const MILESTONE_CARD_WIDTH = 144;
const MILESTONE_STYLE: Record<
  RoadmapMilestone["status"],
  { card: string; dot: string; label: string }
> = {
  done: {
    card: "bg-emerald-50 border-emerald-300",
    dot: "bg-emerald-500 border-emerald-500",
    label: "text-emerald-700",
  },
  in_flight: {
    card: "bg-blue-50 border-blue-300",
    dot: "bg-blue-500 border-blue-500",
    label: "text-blue-700",
  },
  not_started: {
    card: "bg-white border-gray-200",
    dot: "bg-white border-gray-300",
    label: "text-gray-500",
  },
};

function StatusIcon({ status }: { status: RoadmapMilestone["status"] }) {
  if (status === "done") return <Check size={12} className="text-emerald-600" />;
  if (status === "in_flight") return <Loader2 size={12} className="text-blue-600 animate-spin" />;
  return <Circle size={12} className="text-gray-300" />;
}

function monthLabelsForQuarters(quarters: string[]): { key: string; label: string; position: number }[] {
  const months: { key: string; label: string; position: number }[] = [];
  quarters.forEach((q, qIdx) => {
    const match = q.match(/^(\d{4})_q(\d)$/);
    if (!match) return;
    const year = Number(match[1]);
    const startMonth = (Number(match[2]) - 1) * 3;
    const qStart = timelinePositionPercent(qIdx, quarters.length);
    const qEnd =
      qIdx < quarters.length - 1
        ? timelinePositionPercent(qIdx + 1, quarters.length)
        : qStart;
    for (let i = 0; i < 3; i++) {
      const monthIdx = startMonth + i;
      const date = new Date(year, monthIdx, 1);
      const t = quarters.length > 1 && qIdx < quarters.length - 1 ? (i + 0.5) / 3 : 0.5;
      months.push({
        key: `${year}_m${monthIdx + 1}`,
        label: date.toLocaleString("en-US", { month: "short" }),
        position: qStart + t * (qEnd - qStart),
      });
    }
  });
  return months;
}

function groupMilestonesByQuarter(milestones: RoadmapMilestone[]) {
  const groups = new Map<string, RoadmapMilestone[]>();
  for (const m of milestones) {
    const key = m.target_resolution || "unknown";
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  return groups;
}

export function RoadmapTimeline({ properties, milestones, onAddAtQuarter, onEditMilestone }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("quarter");
  const ordered = sortedMilestones(milestones);
  const doneCount = milestoneDoneCount(milestones);
  const quarters = useMemo(() => buildTimelineQuarters(milestones), [milestones]);
  const monthLabels = useMemo(() => monthLabelsForQuarters(quarters), [quarters]);
  const milestoneGroups = useMemo(() => groupMilestonesByQuarter(ordered), [ordered]);

  const needsHorizontalScroll = quarters.length >= TIMELINE_SCROLL_QUARTER_THRESHOLD;

  const closestQuarterFromClick = (pct: number) => {
    let closest = quarters[0]!;
    let minDist = Infinity;
    for (const q of quarters) {
      const dist = Math.abs(milestonePosition(q, quarters) - pct);
      if (dist < minDist) {
        minDist = dist;
        closest = q;
      }
    }
    return closest;
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Milestones · {doneCount} of {milestones.length} done
        </p>

        <div className="flex items-center gap-3 ml-auto">
          <div className="inline-flex rounded-full border border-gray-200 p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("quarter")}
              className={cn(
                "px-3 py-1 rounded-full transition-colors",
                viewMode === "quarter" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              )}
            >
              Quarter
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "px-3 py-1 rounded-full transition-colors",
                viewMode === "month" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              )}
            >
              Month
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAddAtQuarter(quarters[Math.min(1, quarters.length - 1)] ?? quarters[0]!)}
            className="text-xs font-medium text-violet-600 hover:text-violet-700 px-2 py-1 rounded-md hover:bg-violet-50"
          >
            + Add milestone
          </button>
        </div>
      </div>

      <div className={cn(needsHorizontalScroll && "overflow-x-auto -mx-2 px-2")}>
        <div
          className="relative pt-8 pb-32 min-h-[240px] w-full"
          style={{
            ...(needsHorizontalScroll ? { minWidth: quarters.length * 120 } : undefined),
            paddingLeft: MILESTONE_CARD_WIDTH / 2,
            paddingRight: MILESTONE_CARD_WIDTH / 2,
          }}
        >
          <div className="relative h-8 mb-2">
            {viewMode === "quarter"
              ? quarters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onAddAtQuarter(q)}
                    className="absolute -translate-x-1/2 text-[11px] text-gray-400 hover:text-violet-600 transition-colors whitespace-nowrap"
                    style={{ left: `${milestonePosition(q, quarters)}%` }}
                  >
                    {targetResolutionLabel(q)}
                  </button>
                ))
              : monthLabels.map((m) => (
                  <span
                    key={m.key}
                    className="absolute -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap"
                    style={{ left: `${m.position}%` }}
                  >
                    {m.label}
                  </span>
                ))}
          </div>

          <div
            className="relative h-0.5 bg-gray-200 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              onAddAtQuarter(closestQuarterFromClick(pct));
            }}
          >
            {quarters.map((q) => (
              <span
                key={`tick-${q}`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-gray-300"
                style={{ left: `${milestonePosition(q, quarters)}%` }}
              />
            ))}
          </div>

          {ordered.map((milestone, idx) => {
            const style = MILESTONE_STYLE[milestone.status];
            const left = milestonePosition(milestone.target_resolution, quarters);
            const sameQuarter = milestoneGroups.get(milestone.target_resolution) ?? [milestone];
            const stackIndex = sameQuarter.findIndex((m) => m.id === milestone.id);
            const stackOffset = stackIndex * 88;

            return (
              <div
                key={milestone.id}
                className="absolute top-[52px] -translate-x-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${left}%`, marginTop: stackOffset }}
              >
                <div
                  className={cn(
                    "h-8 w-px pointer-events-none",
                    milestone.status === "done" ? "bg-emerald-400" : "bg-gray-300"
                  )}
                />
                <span className={cn("h-2.5 w-2.5 rounded-full border-2 -mt-0.5", style.dot)} />

                <button
                  type="button"
                  onClick={() => onEditMilestone(milestone)}
                  className={cn(
                    "mt-2 w-36 rounded-lg border px-2.5 py-2 text-left shadow-sm hover:shadow transition-shadow pointer-events-auto",
                    style.card
                  )}
                >
                  <span className="text-[10px] font-semibold text-gray-400 block">M{idx + 1}</span>
                  <span className="text-xs font-medium text-gray-900 block leading-snug mt-0.5 line-clamp-2">
                    {milestone.title}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-[10px] mt-1.5", style.label)}>
                    <StatusIcon status={milestone.status} />
                    {ROADMAP_MILESTONE_STATUS_LABEL[milestone.status]}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-400 mt-2">
        Click anywhere on the timeline to add a milestone at that date
      </p>
    </div>
  );
}
