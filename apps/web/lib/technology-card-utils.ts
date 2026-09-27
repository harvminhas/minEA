import { PLATFORM_CRITICALITY_LABEL, PLATFORM_LIFECYCLE_LABEL } from "@/lib/platform-utils";

export const LIFECYCLE_BADGE_STYLE: Record<string, string> = {
  planned: "bg-stone-100 text-gray-600",
  pilot: "bg-stone-100 text-gray-600",
  under_evaluation: "bg-stone-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  retiring: "bg-orange-50 text-orange-700",
  deprecated: "bg-orange-50 text-orange-700",
  end_of_life: "bg-red-50 text-red-500",
  retired: "bg-red-50 text-red-500",
};

export const TECH_CRITICALITY_STYLE: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
  tier1: "bg-red-50 text-red-700",
};

export function lifecycleCardLabel(lifecycle?: string | null): string | null {
  if (!lifecycle) return null;
  return PLATFORM_LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
}

export function lifecycleBadgeStyle(lifecycle?: string | null): string {
  return LIFECYCLE_BADGE_STYLE[lifecycle ?? "planned"] ?? LIFECYCLE_BADGE_STYLE.planned;
}

export function criticalityCardLabel(criticality?: string | null): string {
  const value = criticality ?? "low";
  return PLATFORM_CRITICALITY_LABEL[value] ?? value;
}

export function criticalityBadgeStyle(criticality?: string | null): string {
  return TECH_CRITICALITY_STYLE[criticality ?? "low"] ?? TECH_CRITICALITY_STYLE.low;
}

export function formatAnnualCostDisplay(value?: string | null): string {
  if (!value?.trim()) return "—";
  return value.trim();
}

export function labelFromMap(value: string | undefined, map: Record<string, string>): string {
  if (!value) return "—";
  return map[value] ?? value.replace(/_/g, " ");
}
