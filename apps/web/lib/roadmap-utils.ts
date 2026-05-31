import type { RoadmapItemProperties, RoadmapMilestone } from "@minea/types";
import {
  buildTargetResolutionOptions,
  targetResolutionLabel,
  TECH_DEBT_EFFORT,
  TECH_DEBT_EFFORT_LABEL,
} from "@/lib/tech-debt-utils";

export {
  buildTargetResolutionOptions,
  targetResolutionLabel,
  TECH_DEBT_EFFORT,
  TECH_DEBT_EFFORT_LABEL,
};

export const STRATEGY_LAYER_COLOR = "#8b5cf6";

export const ROADMAP_KINDS = [
  { value: "feature", label: "Feature", hint: "New capability" },
  { value: "epic", label: "Epic", hint: "Multi-quarter work" },
  { value: "initiative", label: "Initiative", hint: "Strategic program" },
  { value: "migration", label: "Migration", hint: "Replace existing" },
  { value: "sunset", label: "Sunset", hint: "Shut down" },
  { value: "discovery", label: "Discovery", hint: "Research / spike" },
] as const;

export const ROADMAP_STATUS = [
  { value: "discovery", label: "Discovery" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "delivered", label: "Delivered" },
  { value: "deferred", label: "Deferred" },
  { value: "cancelled", label: "Cancelled" },
];

export const INVESTMENT_CATEGORIES = [
  { value: "innovation", label: "Innovation" },
  { value: "modernization", label: "Modernization" },
  { value: "run", label: "Run" },
] as const;

export function defaultInvestmentCategory(kind: string): string {
  if (kind === "migration" || kind === "sunset") return "modernization";
  if (kind === "discovery") return "innovation";
  return "innovation";
}

export const ROADMAP_KIND_LABEL = Object.fromEntries(ROADMAP_KINDS.map((k) => [k.value, k.label]));
export const ROADMAP_STATUS_LABEL = Object.fromEntries(ROADMAP_STATUS.map((s) => [s.value, s.label]));

export function roadmapKindLabel(props: RoadmapItemProperties): string {
  return ROADMAP_KIND_LABEL[props.roadmap_kind ?? ""] ?? props.roadmap_kind ?? "";
}

export function buildRoadmapProperties(params: {
  kind: string;
  product: RoadmapItemProperties["product"];
  resolvesDebt: RoadmapItemProperties["resolves_debt"];
  roadmapStatus: string;
  targetResolution: string;
  effortEstimate: string;
  cost?: number | null;
  investmentCategory?: string;
  blockedReason?: string | null;
}): RoadmapItemProperties {
  return {
    roadmap_kind: params.kind as RoadmapItemProperties["roadmap_kind"],
    product: params.product,
    resolves_debt: params.resolvesDebt && params.resolvesDebt.length > 0 ? params.resolvesDebt : undefined,
    roadmap_status: params.roadmapStatus as RoadmapItemProperties["roadmap_status"],
    target_resolution: params.targetResolution || undefined,
    effort_estimate: (params.effortEstimate || undefined) as RoadmapItemProperties["effort_estimate"],
    cost: params.cost != null && params.cost > 0 ? params.cost : undefined,
    investment_category: (params.investmentCategory || undefined) as RoadmapItemProperties["investment_category"],
    blocked_reason: params.blockedReason?.trim() || undefined,
  };
}

export const ROADMAP_MILESTONE_STATUS = [
  { value: "not_started", label: "Not started" },
  { value: "in_flight", label: "In flight" },
  { value: "done", label: "Done" },
] as const;

export const ROADMAP_MILESTONE_STATUS_LABEL = Object.fromEntries(
  ROADMAP_MILESTONE_STATUS.map((s) => [s.value, s.label])
);

export function roadmapListPath(orgSlug: string, workspaceSlug: string) {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/strategy/roadmaps`;
}

export function roadmapDetailPath(orgSlug: string, workspaceSlug: string, roadmapId: string) {
  return `${roadmapListPath(orgSlug, workspaceSlug)}/${roadmapId}`;
}

function parseQuarter(value: string): { year: number; quarter: number } | null {
  const match = value.match(/^(\d{4})_q(\d)$/);
  if (!match) return null;
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

function quarterKey(year: number, quarter: number) {
  return `${year}_q${quarter}`;
}

function compareQuarters(a: string, b: string): number {
  const pa = parseQuarter(a);
  const pb = parseQuarter(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
}

function subtractQuarter(value: { year: number; quarter: number }) {
  if (value.quarter === 1) return { year: value.year - 1, quarter: 4 };
  return { year: value.year, quarter: value.quarter - 1 };
}

function addQuarter(value: { year: number; quarter: number }) {
  if (value.quarter === 4) return { year: value.year + 1, quarter: 1 };
  return { year: value.year, quarter: value.quarter + 1 };
}

function buildQuarterRange(start: { year: number; quarter: number }, end: { year: number; quarter: number }) {
  const range: string[] = [];
  let { year, quarter } = start;
  const endKey = quarterKey(end.year, end.quarter);
  while (true) {
    const key = quarterKey(year, quarter);
    range.push(key);
    if (key === endKey) break;
    const next = addQuarter({ year, quarter });
    year = next.year;
    quarter = next.quarter;
  }
  return range;
}

/** Percent inset so milestone cards (centered on markers) stay inside the track. */
export const TIMELINE_EDGE_INSET = 9;

export function timelinePositionPercent(
  index: number,
  total: number,
  edgeInset = TIMELINE_EDGE_INSET
): number {
  if (total <= 0) return 50;
  if (total === 1) return 50;
  return edgeInset + (index / (total - 1)) * (100 - 2 * edgeInset);
}

/** Build a tight quarter range from milestone dates only (+ small padding). */
export function buildTimelineQuarters(
  milestones: RoadmapMilestone[],
  minSpan = 3,
  emptySpan = 4
): string[] {
  const keys = new Set<string>();
  for (const m of milestones) {
    if (m.target_resolution && m.target_resolution !== "no_target") {
      keys.add(m.target_resolution);
    }
  }

  if (keys.size === 0) {
    return buildTargetResolutionOptions(emptySpan)
      .filter((o) => o.value !== "no_target")
      .map((o) => o.value);
  }

  const sorted = [...keys].sort(compareQuarters);
  let start = parseQuarter(sorted[0]!);
  let end = parseQuarter(sorted[sorted.length - 1]!);
  if (!start || !end) return sorted;

  // One quarter buffer on each side for card placement.
  start = subtractQuarter(start);
  end = addQuarter(end);

  // Ensure a minimal readable span without stretching into empty future quarters.
  while (end.year * 4 + end.quarter - (start.year * 4 + start.quarter) + 1 < minSpan) {
    end = addQuarter(end);
  }

  return buildQuarterRange(start, end);
}

/** Enable horizontal scroll only when the timeline is genuinely wide. */
export const TIMELINE_SCROLL_QUARTER_THRESHOLD = 7;

export function milestonePosition(target: string, quarters: string[]): number {
  let idx = quarters.indexOf(target);
  if (idx < 0) {
    const targetParsed = parseQuarter(target);
    if (!targetParsed) return 50;
    idx = quarters.findIndex((q) => compareQuarters(q, target) >= 0);
    if (idx < 0) idx = quarters.length - 1;
  }
  return timelinePositionPercent(idx, quarters.length);
}

export function sortedMilestones(milestones: RoadmapMilestone[] = []): RoadmapMilestone[] {
  return [...milestones].sort((a, b) => {
    const byQuarter = compareQuarters(a.target_resolution, b.target_resolution);
    if (byQuarter !== 0) return byQuarter;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

export function milestoneDoneCount(milestones: RoadmapMilestone[] = []): number {
  return milestones.filter((m) => m.status === "done").length;
}

export function newMilestoneId() {
  return `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function roadmapStatusToObjectStatus(
  status: string
): "planned" | "active" | "retiring" | "retired" | "deprecated" | "under_evaluation" {
  switch (status) {
    case "delivered":
      return "retired";
    case "cancelled":
      return "deprecated";
    case "deferred":
      return "under_evaluation";
    case "in_progress":
      return "active";
    case "blocked":
      return "active";
    case "planned":
      return "planned";
    default:
      return "under_evaluation";
  }
}
