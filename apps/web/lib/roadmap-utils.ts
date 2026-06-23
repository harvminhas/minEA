import type {
  MinEAObject,
  ProductRoadmapItem,
  ProductRoadmapNextMilestone,
  RoadmapItemProperties,
  RoadmapMilestone,
  RoadmapMilestoneStatus,
  RoadmapSegment,
  RoadmapTimelineView,
  RoadmapTrack,
} from "@minea/types";
import { aiRoleForProperties } from "@/lib/ai-role-utils";
import { resolveRoadmapSpend } from "@/lib/investment-pipeline";
import { formatCurrency } from "@/lib/utils";
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

export const ROADMAP_RISK = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export type RoadmapRisk = (typeof ROADMAP_RISK)[number]["value"];

export const ROADMAP_RISK_LABEL = Object.fromEntries(ROADMAP_RISK.map((r) => [r.value, r.label]));

export const ROADMAP_RISK_STYLE: Record<
  RoadmapRisk,
  { dot: string; pill: string; text: string }
> = {
  low: { dot: "bg-emerald-500", pill: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
  moderate: { dot: "bg-amber-500", pill: "bg-amber-50 border-amber-200", text: "text-amber-900" },
  high: { dot: "bg-orange-500", pill: "bg-orange-50 border-orange-200", text: "text-orange-900" },
  critical: { dot: "bg-red-500", pill: "bg-red-50 border-red-200", text: "text-red-800" },
};

export function roadmapRiskLabel(risk?: RoadmapItemProperties["risk"]): string {
  if (!risk) return "—";
  return ROADMAP_RISK_LABEL[risk] ?? risk;
}

export function roadmapKindLabel(props: RoadmapItemProperties): string {
  return ROADMAP_KIND_LABEL[props.roadmap_kind ?? ""] ?? props.roadmap_kind ?? "";
}

export const TIMELINE_UNITS = [
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "quarters", label: "Quarters" },
] as const;

export type TimelineUnit = (typeof TIMELINE_UNITS)[number]["value"];

export const RELATIVE_DURATION_OPTIONS: Record<TimelineUnit, number[]> = {
  weeks: [4, 8, 12, 16, 20, 24, 32, 48, 52],
  months: [1, 2, 3, 6, 9, 12, 18, 24],
  quarters: [1, 2, 3, 4, 6, 8],
};

function addMonthsUtc(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIsoDate(d);
}

/** End date for a relative span starting at `start` (inclusive). */
export function relativeTimelineEndDate(
  start: string,
  duration: number,
  unit: TimelineUnit
): string {
  if (unit === "weeks") {
    return toIsoDate(new Date(parseIsoDate(start).getTime() + duration * 7 * DAY_MS - DAY_MS));
  }
  if (unit === "months") {
    return toIsoDate(new Date(parseIsoDate(addMonthsUtc(start, duration)).getTime() - DAY_MS));
  }
  return relativeTimelineEndDate(start, duration * 3, "months");
}

export function deriveTimelineView(params: {
  mode: "date_bound" | "relative";
  startDate?: string;
  endDate?: string;
  duration?: number;
  unit?: TimelineUnit;
}): import("@minea/types").RoadmapTimelineView | undefined {
  if (params.mode === "date_bound" && params.startDate && params.endDate) {
    return { start_date: params.startDate, end_date: params.endDate };
  }
  if (params.mode === "relative" && params.duration && params.unit) {
    const start = toIsoDate(startOfWeek(new Date()));
    return {
      start_date: start,
      end_date: relativeTimelineEndDate(start, params.duration, params.unit),
    };
  }
  return undefined;
}

/** First day of month from HTML month input (YYYY-MM). */
export function monthInputToStartDate(month: string): string {
  return `${month}-01`;
}

/** Last day of month from HTML month input (YYYY-MM). */
export function monthInputToEndDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function isoToMonthInput(iso: string): string {
  return iso.slice(0, 7);
}

function formatMonthYearFromIso(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Display label for roadmap item timeline (detail cards, list). */
export function formatRoadmapTimelineLabel(props: RoadmapItemProperties): string {
  const mode = props.timeline_mode;
  if (mode === "relative" || (props.timeline_duration && props.timeline_unit)) {
    const n = props.timeline_duration ?? 12;
    const unit = props.timeline_unit ?? "weeks";
    const unitLabel = TIMELINE_UNITS.find((u) => u.value === unit)?.label ?? unit;
    return `${n} ${unitLabel.toLowerCase()}`;
  }
  if (props.timeline_start_date && props.timeline_end_date) {
    return `${formatMonthYearFromIso(props.timeline_start_date)} – ${formatMonthYearFromIso(props.timeline_end_date)}`;
  }
  if (props.target_resolution) {
    return targetResolutionLabel(props.target_resolution) || "—";
  }
  return "—";
}

export function buildRoadmapProperties(params: {
  kind: string;
  product: RoadmapItemProperties["product"];
  resolvesDebt: RoadmapItemProperties["resolves_debt"];
  roadmapStatus: string;
  timelineMode: "date_bound" | "relative";
  timelineStartDate?: string;
  timelineEndDate?: string;
  timelineDuration?: number;
  timelineUnit?: TimelineUnit;
  effortEstimate: string;
  cost?: number | null;
  investmentCategory?: string;
  blockedReason?: string | null;
  outcome?: string;
  risk?: string;
  aiRole?: string;
}): RoadmapItemProperties {
  const timeline_view = deriveTimelineView({
    mode: params.timelineMode,
    startDate: params.timelineStartDate,
    endDate: params.timelineEndDate,
    duration: params.timelineDuration,
    unit: params.timelineUnit,
  });

  return {
    roadmap_kind: params.kind as RoadmapItemProperties["roadmap_kind"],
    product: params.product ?? undefined,
    resolves_debt: params.resolvesDebt && params.resolvesDebt.length > 0 ? params.resolvesDebt : undefined,
    roadmap_status: params.roadmapStatus as RoadmapItemProperties["roadmap_status"],
    timeline_mode: params.timelineMode,
    timeline_start_date:
      params.timelineMode === "date_bound" ? params.timelineStartDate : undefined,
    timeline_end_date: params.timelineMode === "date_bound" ? params.timelineEndDate : undefined,
    timeline_duration: params.timelineMode === "relative" ? params.timelineDuration : undefined,
    timeline_unit: params.timelineMode === "relative" ? params.timelineUnit : undefined,
    timeline_view,
    effort_estimate: (params.effortEstimate || undefined) as RoadmapItemProperties["effort_estimate"],
    cost: params.cost != null && params.cost > 0 ? params.cost : undefined,
    investment_category: (params.investmentCategory || undefined) as RoadmapItemProperties["investment_category"],
    blocked_reason: params.blockedReason?.trim() || undefined,
    outcome: params.outcome?.trim() || undefined,
    risk: (params.risk || undefined) as RoadmapItemProperties["risk"],
    ai_role: aiRoleForProperties(params.aiRole),
  };
}

export const ROADMAP_MILESTONE_STATUS = [
  { value: "not_started", label: "Not started" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "done", label: "Done" },
] as const;

export const ROADMAP_MILESTONE_STATUS_LABEL = Object.fromEntries(
  ROADMAP_MILESTONE_STATUS.map((s) => [s.value, s.label])
);

/** Legacy `in_flight` reads as on track. */
export function normalizeSegmentStatus(
  status?: RoadmapMilestoneStatus | string | null
): "not_started" | "on_track" | "at_risk" | "done" {
  if (status === "done") return "done";
  if (status === "at_risk") return "at_risk";
  if (status === "on_track" || status === "in_flight") return "on_track";
  return "not_started";
}

export function segmentStatusLabel(status?: RoadmapMilestoneStatus | string | null): string {
  const normalized = normalizeSegmentStatus(status);
  return ROADMAP_MILESTONE_STATUS_LABEL[normalized] ?? normalized;
}

export type SegmentStatusDensity = "full" | "short" | "dot";

/** Abbreviated labels for narrow timeline segments. */
export const SEGMENT_STATUS_SHORT: Record<
  ReturnType<typeof normalizeSegmentStatus>,
  string
> = {
  not_started: "NS",
  on_track: "OT",
  at_risk: "AR",
  done: "✓",
};

export function segmentStatusShortLabel(status?: RoadmapMilestoneStatus | string | null): string {
  const normalized = normalizeSegmentStatus(status);
  return SEGMENT_STATUS_SHORT[normalized];
}

/** Minimum segment bar width (px) for each status display mode. */
const STATUS_FULL_MIN_PX = 76;
const STATUS_SHORT_MIN_PX = 26;

/** Pick badge density from segment bar width (% of timeline, optional canvas px width). */
export function segmentStatusDensity(
  barWidthPct: number,
  canvasWidthPx?: number
): SegmentStatusDensity {
  if (canvasWidthPx != null && canvasWidthPx > 0) {
    const barWidthPx = (barWidthPct / 100) * canvasWidthPx;
    if (barWidthPx >= STATUS_FULL_MIN_PX) return "full";
    if (barWidthPx >= STATUS_SHORT_MIN_PX) return "short";
    return "dot";
  }
  if (barWidthPct >= 16) return "full";
  if (barWidthPct >= 7) return "short";
  return "dot";
}

export const SEGMENT_STATUS_BADGE: Record<
  ReturnType<typeof normalizeSegmentStatus>,
  { pill: string; onBar?: string }
> = {
  done: {
    pill: "bg-emerald-600 text-white border-emerald-700",
    onBar: "bg-emerald-50 text-emerald-900 border-emerald-300",
  },
  on_track: {
    pill: "bg-slate-700 text-white border-slate-800",
    onBar: "bg-white text-slate-900 border-slate-300 shadow-sm",
  },
  at_risk: {
    pill: "bg-orange-500 text-white border-orange-600",
    onBar: "bg-orange-50 text-orange-900 border-orange-300",
  },
  not_started: {
    pill: "bg-gray-100 text-gray-700 border-gray-300",
    onBar: "bg-white/90 text-gray-600 border-gray-300",
  },
};

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

function compareQuarters(a: string, b: string): number {
  const pa = parseQuarter(a);
  const pb = parseQuarter(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
}

export function sortedMilestones(milestones: RoadmapMilestone[] = []): RoadmapMilestone[] {
  return [...milestones].sort((a, b) => {
    const byQuarter = compareQuarters(a.target_resolution, b.target_resolution);
    if (byQuarter !== 0) return byQuarter;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

// ─── Tracks & segments ─────────────────────────────────────────────────────

export function newTrackId() {
  return `trk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newSegmentId() {
  return `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Lane palette cycled across tracks (mirrors the reference visual). */
export const TRACK_COLORS = [
  "#3b4467", // deep navy
  "#7c8494", // slate gray
  "#e3a06d", // apricot
  "#6f9e6f", // moss green
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#d97706", // amber
  "#e11d48", // rose
] as const;

export function trackColor(track: RoadmapTrack, index: number): string {
  return track.color ?? TRACK_COLORS[index % TRACK_COLORS.length]!;
}

function quarterToDates(key: string): { start: string; end: string } | null {
  const parsed = parseQuarter(key);
  if (!parsed) return null;
  const startMonth = (parsed.quarter - 1) * 3; // 0-based
  const start = new Date(Date.UTC(parsed.year, startMonth, 1));
  const end = new Date(Date.UTC(parsed.year, startMonth + 3, 0));
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** Legacy milestone → single-segment track spanning its target quarter. */
function trackFromMilestone(m: RoadmapMilestone, index: number): RoadmapTrack {
  const dates = quarterToDates(m.target_resolution) ?? {
    start: toIsoDate(new Date()),
    end: toIsoDate(new Date(Date.now() + 6 * 7 * 86_400_000)),
  };
  return {
    id: `trk_legacy_${m.id}`,
    label: m.title,
    sort_order: m.sort_order ?? index,
    segments: [
      {
        id: `seg_legacy_${m.id}`,
        label: m.title,
        start_date: dates.start,
        end_date: dates.end,
        status: m.status,
      },
    ],
  };
}

/** Tracks for an item — converts legacy milestones when tracks are absent. */
export function tracksFromProperties(props: RoadmapItemProperties): RoadmapTrack[] {
  if (props.tracks != null) return props.tracks;
  const milestones = sortedMilestones(props.milestones ?? []);
  return milestones.map(trackFromMilestone);
}

export function sortedTracks(tracks: RoadmapTrack[]): RoadmapTrack[] {
  return [...tracks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function sortedSegments(segments: RoadmapSegment[]): RoadmapSegment[] {
  return [...segments].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export function flattenSegments(tracks: RoadmapTrack[]): RoadmapSegment[] {
  return sortedSegments(tracks.flatMap((t) => t.segments));
}

export function segmentDoneCount(tracks: RoadmapTrack[]): number {
  return tracks.reduce(
    (sum, t) => sum + t.segments.filter((s) => s.status === "done").length,
    0
  );
}

export function segmentTotalCount(tracks: RoadmapTrack[]): number {
  return tracks.reduce((sum, t) => sum + t.segments.length, 0);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatSegmentDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Human-readable span for segment hover cards and detail. */
export function formatSegmentSpanLabel(
  segment: RoadmapSegment,
  binding: RoadmapTimelineBinding
): string {
  if (binding.mode === "relative" && binding.periodPrefix) {
    const start = dateToPeriod(binding, segment.start_date);
    const end = dateToPeriod(binding, segment.end_date);
    const p = binding.periodPrefix;
    if (start === end) return `${p}${start}`;
    return `${p}${start} – ${p}${end}`;
  }
  if (segment.start_date === segment.end_date) {
    return formatSegmentDate(segment.start_date);
  }
  return `${formatSegmentDate(segment.start_date)} – ${formatSegmentDate(segment.end_date)}`;
}

function formatMonthYear(d: Date): string {
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export type TimelineAxisMode = "week" | "month" | "quarter";

export interface TimelineTick {
  key: string;
  label: string;
  /** 0–100 position along the range. */
  position: number;
}

export interface TimelineRange {
  /** Inclusive ISO dates. */
  start: string;
  end: string;
  /** Total days spanned (>= 1). */
  days: number;
}

const DAY_MS = 86_400_000;

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1; // Monday start
  return new Date(d.getTime() - diff * DAY_MS);
}

/** Visual gap between adjacent segment bars (percent of canvas width). */
export const SEGMENT_BAR_GAP_PCT = 0.45;

const DEFAULT_EMPTY_WEEKS = 12;
const MIN_TIMELINE_WEEKS = 4;
const EXTEND_WEEKS = 4;

function endOfWeek(d: Date): Date {
  const monday = startOfWeek(d);
  return new Date(monday.getTime() + 7 * DAY_MS - DAY_MS);
}

/** Range derived from segment dates only (no persisted view extension). */
export function autoTimelineRange(tracks: RoadmapTrack[]): TimelineRange {
  const segments = flattenSegments(tracks);
  let start: Date;
  let end: Date;
  if (segments.length === 0) {
    start = startOfWeek(new Date());
    end = new Date(start.getTime() + DEFAULT_EMPTY_WEEKS * 7 * DAY_MS - DAY_MS);
  } else {
    start = startOfWeek(parseIsoDate(segments[0]!.start_date));
    const maxEnd = segments.reduce(
      (max, s) => (s.end_date > max ? s.end_date : max),
      segments[0]!.end_date
    );
    end = endOfWeek(parseIsoDate(maxEnd));
    const minEnd = new Date(start.getTime() + MIN_TIMELINE_WEEKS * 7 * DAY_MS - DAY_MS);
    if (end < minEnd) end = minEnd;
  }
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  return { start: toIsoDate(start), end: toIsoDate(end), days };
}

/** Visible range: auto bounds merged with optional persisted extensions. */
export function buildTimelineRange(
  tracks: RoadmapTrack[],
  view?: RoadmapTimelineView
): TimelineRange {
  const segments = flattenSegments(tracks);

  // Empty roadmap: honour persisted timeline_view from create form (relative weeks, date-bound, etc.)
  if (segments.length === 0 && view?.start_date && view?.end_date) {
    const start = parseIsoDate(view.start_date);
    const end = parseIsoDate(view.end_date);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
    return { start: view.start_date, end: view.end_date, days };
  }

  const auto = autoTimelineRange(tracks);
  let start = parseIsoDate(auto.start);
  let end = parseIsoDate(auto.end);

  if (view?.start_date) {
    const earlier = startOfWeek(parseIsoDate(view.start_date));
    if (earlier < start) start = earlier;
  }
  if (view?.end_date) {
    const later = endOfWeek(parseIsoDate(view.end_date));
    if (later > end) end = later;
  }

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  return { start: toIsoDate(start), end: toIsoDate(end), days };
}

/** How the Gantt axis and segment pickers align with the roadmap item timeline settings. */
export interface RoadmapTimelineBinding {
  mode: "date_bound" | "relative";
  axis: TimelineAxisMode;
  range: TimelineRange;
  /** 1-based max period index (W12 → 12, etc.). */
  maxPeriod: number;
  unit?: TimelineUnit;
  periodPrefix: string;
}

export function resolveTimelineBinding(
  props: RoadmapItemProperties,
  tracks: RoadmapTrack[]
): RoadmapTimelineBinding {
  const range = buildTimelineRange(tracks, props.timeline_view);
  const mode =
    props.timeline_mode ??
    (props.timeline_start_date && props.timeline_end_date ? "date_bound" : "relative");

  if (mode === "date_bound") {
    const months = countMonthsInRange(range);
    return {
      mode: "date_bound",
      axis: "month",
      range,
      maxPeriod: months,
      periodPrefix: "",
    };
  }

  const unit = props.timeline_unit ?? "weeks";
  const duration =
    props.timeline_duration ??
    (unit === "weeks"
      ? Math.ceil(range.days / 7)
      : unit === "months"
        ? countMonthsInRange(range)
        : Math.max(1, Math.ceil(countMonthsInRange(range) / 3)));

  const axis: TimelineAxisMode =
    unit === "weeks" ? "week" : unit === "months" ? "month" : "quarter";
  const periodPrefix = unit === "weeks" ? "W" : unit === "months" ? "M" : "Q";

  return { mode: "relative", axis, range, maxPeriod: duration, unit, periodPrefix };
}

function countMonthsInRange(range: TimelineRange): number {
  const start = parseIsoDate(range.start);
  const end = parseIsoDate(range.end);
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

export function formatTimelineBindingLabel(binding: RoadmapTimelineBinding): string {
  if (binding.mode === "relative") {
    const unitLabel =
      TIMELINE_UNITS.find((u) => u.value === binding.unit)?.label.toLowerCase() ?? "weeks";
    return `${binding.maxPeriod} ${unitLabel} · ${binding.periodPrefix}1–${binding.periodPrefix}${binding.maxPeriod}`;
  }
  return `${formatMonthYearFromIso(binding.range.start)} – ${formatMonthYearFromIso(binding.range.end)}`;
}

/** Start ISO for a 1-based period within the binding range. */
export function periodToStartDate(binding: RoadmapTimelineBinding, period: number): string {
  const p = Math.min(Math.max(1, period), binding.maxPeriod);
  const anchor = parseIsoDate(binding.range.start);

  if (binding.axis === "week") {
    return toIsoDate(new Date(anchor.getTime() + (p - 1) * 7 * DAY_MS));
  }
  if (binding.axis === "month") {
    if (binding.mode === "relative") {
      return toIsoDate(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + p - 1, 1)));
    }
    const months = listMonthsInRange(binding.range);
    return monthInputToStartDate(months[p - 1] ?? months[0]!);
  }
  // quarter
  if (binding.mode === "relative") {
    return toIsoDate(
      new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + (p - 1) * 3, 1))
    );
  }
  const quarters = listQuartersInRange(binding.range);
  return monthInputToStartDate(quarters[p - 1] ?? quarters[0]!);
}

/** End ISO (inclusive) for a 1-based period. */
export function periodToEndDate(binding: RoadmapTimelineBinding, period: number): string {
  const p = Math.min(Math.max(1, period), binding.maxPeriod);
  const rangeEnd = parseIsoDate(binding.range.end);

  if (binding.axis === "week") {
    const start = parseIsoDate(periodToStartDate(binding, p));
    const end = new Date(start.getTime() + 6 * DAY_MS);
    return toIsoDate(end > rangeEnd ? rangeEnd : end);
  }
  if (binding.axis === "month") {
    if (binding.mode === "relative") {
      const anchor = parseIsoDate(binding.range.start);
      const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + p, 0));
      return toIsoDate(end > rangeEnd ? rangeEnd : end);
    }
    const months = listMonthsInRange(binding.range);
    return monthInputToEndDate(months[p - 1] ?? months[0]!);
  }
  if (binding.mode === "relative") {
    const anchor = parseIsoDate(binding.range.start);
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + p * 3, 0));
    return toIsoDate(end > rangeEnd ? rangeEnd : end);
  }
  const quarters = listQuartersInRange(binding.range);
  const qMonth = quarters[p - 1] ?? quarters[0]!;
  return monthInputToEndDate(qMonth);
}

export function dateToPeriod(binding: RoadmapTimelineBinding, iso: string): number {
  const t = parseIsoDate(iso).getTime();
  const start = parseIsoDate(binding.range.start).getTime();

  if (binding.axis === "week") {
    const idx = Math.floor((t - start) / (7 * DAY_MS)) + 1;
    return Math.min(Math.max(1, idx), binding.maxPeriod);
  }
  if (binding.axis === "month") {
    if (binding.mode === "relative") {
      const anchor = parseIsoDate(binding.range.start);
      const d = parseIsoDate(iso);
      const idx =
        (d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        (d.getUTCMonth() - anchor.getUTCMonth()) +
        1;
      return Math.min(Math.max(1, idx), binding.maxPeriod);
    }
    const months = listMonthsInRange(binding.range);
    const key = isoToMonthInput(iso);
    const idx = months.indexOf(key);
    return idx >= 0 ? idx + 1 : 1;
  }
  if (binding.mode === "relative") {
    const anchor = parseIsoDate(binding.range.start);
    const d = parseIsoDate(iso);
    const idx =
      Math.floor(
        ((d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
          (d.getUTCMonth() - anchor.getUTCMonth())) /
          3
      ) + 1;
    return Math.min(Math.max(1, idx), binding.maxPeriod);
  }
  const quarters = listQuartersInRange(binding.range);
  const key = isoToMonthInput(iso);
  const idx = quarters.indexOf(key);
  return idx >= 0 ? idx + 1 : 1;
}

export function periodOptions(binding: RoadmapTimelineBinding): { value: string; label: string }[] {
  if (binding.mode === "date_bound" && binding.axis === "month") {
    return listMonthsInRange(binding.range).map((m) => ({
      value: m,
      label: formatMonthYearFromIso(monthInputToStartDate(m)),
    }));
  }
  return Array.from({ length: binding.maxPeriod }, (_, i) => ({
    value: String(i + 1),
    label: `${binding.periodPrefix}${i + 1}`,
  }));
}

function listMonthsInRange(range: TimelineRange): string[] {
  const months: string[] = [];
  const cursor = new Date(
    Date.UTC(
      parseIsoDate(range.start).getUTCFullYear(),
      parseIsoDate(range.start).getUTCMonth(),
      1
    )
  );
  const end = parseIsoDate(range.end);
  while (cursor <= end) {
    months.push(isoToMonthInput(toIsoDate(cursor)));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function listQuartersInRange(range: TimelineRange): string[] {
  const months = listMonthsInRange(range);
  return months.filter((_, i) => i % 3 === 0);
}

export function defaultSegmentPeriods(
  binding: RoadmapTimelineBinding,
  startDate?: string
): { startPeriod: number; endPeriod: number } {
  const startPeriod = startDate ? dateToPeriod(binding, startDate) : 1;
  const endPeriod = Math.min(startPeriod + (binding.axis === "week" ? 1 : 0), binding.maxPeriod);
  return { startPeriod, endPeriod: Math.max(startPeriod, endPeriod) };
}

/** Extend the persisted timeline view by N weeks on either end. */
export function extendTimelineView(
  view: RoadmapTimelineView | undefined,
  auto: TimelineRange,
  direction: "start" | "end",
  weeks = EXTEND_WEEKS
): RoadmapTimelineView {
  const next: RoadmapTimelineView = { ...view };
  if (direction === "end") {
    const base = view?.end_date ? parseIsoDate(view.end_date) : parseIsoDate(auto.end);
    next.end_date = toIsoDate(endOfWeek(new Date(base.getTime() + weeks * 7 * DAY_MS)));
  } else {
    const base = view?.start_date ? parseIsoDate(view.start_date) : parseIsoDate(auto.start);
    next.start_date = toIsoDate(startOfWeek(new Date(base.getTime() - weeks * 7 * DAY_MS)));
  }
  return next;
}

export function formatTimelineRangeLabel(range: TimelineRange): string {
  return `${formatSegmentDate(range.start)} – ${formatSegmentDate(range.end)}`;
}

export function datePositionPercent(iso: string, range: TimelineRange): number {
  const t = parseIsoDate(iso).getTime();
  const start = parseIsoDate(range.start).getTime();
  const pct = ((t - start) / DAY_MS / range.days) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** Where to place the "add segment" control — just after the last segment on a lane. */
export function segmentAddAnchor(
  track: RoadmapTrack,
  binding: RoadmapTimelineBinding
): { leftPct: number; startDate: string } {
  const { range } = binding;
  const segs = sortedSegments(track.segments);
  if (segs.length === 0) {
    return { leftPct: 1, startDate: range.start };
  }
  const last = segs[segs.length - 1]!;
  const bar = segmentBarStyle(last, range);
  const lastPeriod = dateToPeriod(binding, last.end_date);
  const nextPeriod = Math.min(lastPeriod + 1, binding.maxPeriod);
  const nextStart = periodToStartDate(binding, nextPeriod);
  return {
    leftPct: Math.min(bar.left + bar.width + 0.8, 90),
    startDate: nextStart,
  };
}

/** Segment bar geometry as percentages (end date inclusive, with trailing gap). */
export function segmentBarStyle(
  segment: RoadmapSegment,
  range: TimelineRange,
  gapPct = SEGMENT_BAR_GAP_PCT
): { left: number; width: number } {
  const left = datePositionPercent(segment.start_date, range);
  const endPct = datePositionPercent(segment.end_date, range);
  const dayWidth = 100 / range.days;
  const rawWidth = endPct - left + dayWidth - gapPct;
  const width = Math.max(rawWidth, 1.2);
  return { left, width: Math.min(width, 100 - left) };
}

export function buildTimelineTicks(
  range: TimelineRange,
  mode: TimelineAxisMode,
  opts?: { relative?: boolean; maxPeriod?: number; periodPrefix?: string }
): TimelineTick[] {
  const start = parseIsoDate(range.start);
  const end = parseIsoDate(range.end);
  const ticks: TimelineTick[] = [];
  const relative = opts?.relative ?? false;
  const maxPeriod = opts?.maxPeriod ?? 0;
  const prefix = opts?.periodPrefix ?? "";

  if (mode === "week") {
    const totalWeeks = relative && maxPeriod > 0 ? maxPeriod : Math.ceil(range.days / 7);
    const step = totalWeeks > 32 ? 4 : totalWeeks > 16 ? 2 : 1;
    for (let w = 0; w < totalWeeks; w += step) {
      const d = new Date(start.getTime() + w * 7 * DAY_MS);
      if (d > end) break;
      ticks.push({
        key: `w${w + 1}`,
        label: `W${w + 1}`,
        position: datePositionPercent(toIsoDate(d), range),
      });
    }
    return ticks;
  }

  if (mode === "month") {
    if (relative && maxPeriod > 0) {
      const step = maxPeriod > 16 ? 2 : 1;
      for (let m = 1; m <= maxPeriod; m += step) {
        const binding: RoadmapTimelineBinding = {
          mode: "relative",
          axis: "month",
          range,
          maxPeriod,
          unit: "months",
          periodPrefix: prefix || "M",
        };
        ticks.push({
          key: `m${m}`,
          label: `${prefix || "M"}${m}`,
          position: datePositionPercent(periodToStartDate(binding, m), range),
        });
      }
      return ticks;
    }
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    if (cursor < start) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    while (cursor <= end) {
      ticks.push({
        key: toIsoDate(cursor),
        label: formatMonthYear(cursor),
        position: datePositionPercent(toIsoDate(cursor), range),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    if (ticks.length === 0) {
      ticks.push({ key: range.start, label: formatMonthYear(start), position: 0 });
    }
    return ticks;
  }

  // quarter
  if (relative && maxPeriod > 0) {
    for (let q = 1; q <= maxPeriod; q++) {
      const binding: RoadmapTimelineBinding = {
        mode: "relative",
        axis: "quarter",
        range,
        maxPeriod,
        unit: "quarters",
        periodPrefix: prefix || "Q",
      };
      ticks.push({
        key: `q${q}`,
        label: `${prefix || "Q"}${q}`,
        position: datePositionPercent(periodToStartDate(binding, q), range),
      });
    }
    return ticks;
  }

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
  if (cursor < start) cursor.setUTCMonth(cursor.getUTCMonth() + 3);
  while (cursor <= end) {
    const q = Math.floor(cursor.getUTCMonth() / 3) + 1;
    ticks.push({
      key: toIsoDate(cursor),
      label: `Q${q} ${cursor.getUTCFullYear()}`,
      position: datePositionPercent(toIsoDate(cursor), range),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 3);
  }
  if (ticks.length === 0) {
    const q = Math.floor(start.getUTCMonth() / 3) + 1;
    ticks.push({ key: range.start, label: `Q${q} ${start.getUTCFullYear()}`, position: 0 });
  }
  return ticks;
}

/** Date at a percent position along the range, snapped to week start. */
export function dateAtPercent(pct: number, range: TimelineRange): string {
  const start = parseIsoDate(range.start);
  const dayOffset = Math.round((pct / 100) * range.days);
  const d = new Date(start.getTime() + dayOffset * DAY_MS);
  return toIsoDate(startOfWeek(d));
}

export const ROADMAP_EFFORT_SHORT: Record<string, string> = {
  s: "S · <2 wk",
  m: "M · 2–8 wk",
  l: "L · 2–6 mo",
  xl: "XL · 6+ mo",
};

export const ROADMAP_MILESTONE_SEGMENT: Record<string, string> = {
  done: "bg-emerald-500",
  on_track: "bg-gray-700",
  in_flight: "bg-gray-700",
  at_risk: "bg-orange-400",
  not_started: "bg-gray-200",
};

export interface RoadmapCardModel {
  id: string;
  name: string;
  kindLabel: string;
  statusLabel: string;
  subtitle: string;
  spendLabel: string;
  targetLabel: string;
  effortLabel: string;
  resolvesDebtCount: number;
  milestoneStrip: { status: string }[];
  milestonesDone: number;
  milestonesTotal: number;
  nextMilestone?: ProductRoadmapNextMilestone | null;
  updatedAt?: string;
  updatedByName?: string | null;
}

export function formatRoadmapSpendDisplay(props: RoadmapItemProperties): string {
  const { amount, estimated } = resolveRoadmapSpend(props);
  if (amount <= 0) return "—";
  return `${formatCurrency(amount)}${estimated ? " est" : ""}`;
}

export function formatRoadmapEffortDisplay(props: RoadmapItemProperties): string {
  const effort = props.effort_estimate ?? "";
  return ROADMAP_EFFORT_SHORT[effort] ?? "—";
}

export function nextSegmentFromTracks(tracks: RoadmapTrack[]): ProductRoadmapNextMilestone | null {
  for (const s of flattenSegments(tracks)) {
    if (s.status !== "done") {
      return { title: s.label, target_label: formatSegmentDate(s.end_date) };
    }
  }
  return null;
}

export function roadmapCardFromObject(item: MinEAObject): RoadmapCardModel {
  const props = (item.properties ?? {}) as RoadmapItemProperties;
  const tracks = tracksFromProperties(props);
  const segments = flattenSegments(tracks);
  const done = segmentDoneCount(tracks);
  const strip = segments.map((s) => ({ status: normalizeSegmentStatus(s.status) }));

  return {
    id: item.id,
    name: item.name,
    kindLabel: roadmapKindLabel(props) || "Item",
    statusLabel: ROADMAP_STATUS_LABEL[props.roadmap_status ?? "discovery"] ?? "Discovery",
    subtitle: [props.product?.product_name, item.point_of_contact_name ?? item.owner_team_name ?? item.owner]
      .filter(Boolean)
      .join(" · "),
    spendLabel: formatRoadmapSpendDisplay(props),
    targetLabel: formatRoadmapTimelineLabel(props),
    effortLabel: formatRoadmapEffortDisplay(props),
    resolvesDebtCount: props.resolves_debt?.length ?? 0,
    milestoneStrip: strip,
    milestonesDone: done,
    milestonesTotal: segments.length,
    nextMilestone: nextSegmentFromTracks(tracks),
    updatedAt: item.updated_at,
    updatedByName: item.updated_by_name,
  };
}

export function roadmapCardFromProductItem(item: ProductRoadmapItem): RoadmapCardModel {
  const subtitle = [item.product_name, item.owner].filter(Boolean).join(" · ");
  return {
    id: item.id,
    name: item.name,
    kindLabel: item.kind_label,
    statusLabel: item.status_label,
    subtitle,
    spendLabel: item.spend_label ?? "—",
    targetLabel: item.target_label,
    effortLabel: item.effort_label ?? "—",
    resolvesDebtCount: item.resolves_debt_count ?? 0,
    milestoneStrip: item.milestone_strip,
    milestonesDone: item.milestones_done,
    milestonesTotal: item.milestones_total,
    nextMilestone: item.next_milestone,
    updatedAt: item.updated_at,
    updatedByName: item.updated_by_name,
  };
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
