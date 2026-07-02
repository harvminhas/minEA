"use client";

import { cn } from "@/lib/utils";

export interface FitnessSegmentCounts {
  strong: number;
  adequate: number;
  weak?: number;
  gap: number;
}

export function FitnessHealthBar({
  counts,
  total,
}: {
  counts: FitnessSegmentCounts;
  total: number;
}) {
  if (total === 0) {
    return <div className="h-2 rounded-full bg-gray-100" />;
  }
  const segments = [
    { key: "strong", count: counts.strong, className: "bg-emerald-500" },
    { key: "adequate", count: counts.adequate, className: "bg-amber-400" },
    { key: "weak", count: counts.weak ?? 0, className: "bg-red-500" },
    { key: "gap", count: counts.gap, className: "bg-gray-300" },
  ].filter((s) => s.count > 0);

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
      {segments.map((seg) => (
        <div
          key={seg.key}
          className={cn("h-full transition-all", seg.className)}
          style={{ width: `${(seg.count / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function FitnessLegend({
  counts,
  hideZero = false,
  className,
}: {
  counts: FitnessSegmentCounts;
  hideZero?: boolean;
  className?: string;
}) {
  const items = [
    { label: "strong", count: counts.strong, dot: "bg-emerald-500" },
    { label: "adequate", count: counts.adequate, dot: "bg-amber-400" },
    { label: "weak", count: counts.weak ?? 0, dot: "bg-red-500" },
    { label: "gap", count: counts.gap, dot: "bg-red-500" },
  ].filter((item) => !hideZero || item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500", className)}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", item.dot)} />
          {item.count} {item.label}
        </span>
      ))}
    </div>
  );
}
