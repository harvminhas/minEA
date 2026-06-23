"use client";

import {
  normalizeSegmentStatus,
  ROADMAP_MILESTONE_STATUS,
  segmentStatusLabel,
  segmentStatusShortLabel,
  type SegmentStatusDensity,
} from "@/lib/roadmap-utils";
import { cn } from "@/lib/utils";

type NormalizedStatus = ReturnType<typeof normalizeSegmentStatus>;

/** Explicit classes so Tailwind always includes them. */
const BADGE_PILL: Record<NormalizedStatus, string> = {
  done: "bg-emerald-600 text-white border-emerald-700",
  on_track: "bg-gray-900 text-white border-gray-800",
  at_risk: "bg-orange-500 text-white border-orange-600",
  not_started: "bg-gray-100 text-gray-700 border-gray-300",
};

const BADGE_ON_BAR: Record<NormalizedStatus, string> = {
  done: "bg-emerald-50 text-emerald-900 border-emerald-300",
  on_track: "bg-white text-gray-900 border-gray-300 shadow-sm",
  at_risk: "bg-orange-50 text-orange-900 border-orange-300",
  not_started: "bg-white/90 text-gray-600 border-gray-300",
};

const DOT_ON_BAR: Record<NormalizedStatus, string> = {
  done: "bg-emerald-500 ring-emerald-200",
  on_track: "bg-gray-900 ring-white/80",
  at_risk: "bg-orange-500 ring-orange-200",
  not_started: "bg-gray-300 ring-white/70",
};

function badgePadding(density: SegmentStatusDensity, compact: boolean): string {
  if (density === "dot") return "";
  if (density === "short") return compact ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  return compact ? "px-1.5 py-0.5 text-[9px] leading-none" : "px-2 py-0.5 text-[10px]";
}

export function SegmentStatusBadge({
  status,
  className,
  compact = false,
}: {
  status?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const normalized = normalizeSegmentStatus(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold whitespace-nowrap flex-shrink-0",
        badgePadding("full", compact),
        BADGE_PILL[normalized],
        className
      )}
    >
      {segmentStatusLabel(normalized)}
    </span>
  );
}

/** Responsive status indicator for timeline segment bars. */
export function SegmentBarStatus({
  status,
  density,
  className,
}: {
  status?: string | null;
  density: SegmentStatusDensity;
  className?: string;
}) {
  const normalized = normalizeSegmentStatus(status);
  const fullLabel = segmentStatusLabel(normalized);

  if (density === "dot") {
    return (
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full flex-shrink-0 ring-2",
          DOT_ON_BAR[normalized],
          className
        )}
        title={fullLabel}
        aria-label={fullLabel}
      />
    );
  }

  const label = density === "short" ? segmentStatusShortLabel(normalized) : fullLabel;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold whitespace-nowrap flex-shrink-0",
        badgePadding(density, true),
        BADGE_ON_BAR[normalized],
        className
      )}
      title={density === "short" ? fullLabel : undefined}
      aria-label={fullLabel}
    >
      {label}
    </span>
  );
}

export function SegmentStatusLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {ROADMAP_MILESTONE_STATUS.map((item) => (
        <SegmentStatusBadge key={item.value} status={item.value} />
      ))}
      <span className="text-[10px] text-gray-400 ml-1 hidden sm:inline">
        Labels shorten on narrow bars; expand for full text when space allows
      </span>
    </div>
  );
}
