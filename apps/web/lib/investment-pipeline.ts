import type { MinEAObject, RoadmapItemProperties } from "@minea/types";
import { defaultInvestmentCategory } from "@/lib/roadmap-utils";

export type PipelineStageId = "discovery" | "committed" | "in_flight" | "blocked" | "done_ytd";

export type InvestmentCategory = "innovation" | "modernization" | "run";

/** Effort → spend rate card (USD). Used when cost is not set on the roadmap item. */
export const EFFORT_SPEND_RATES: Record<string, number> = {
  s: 50_000,
  m: 200_000,
  l: 500_000,
  xl: 1_000_000,
};

export const INVESTMENT_CATEGORIES = [
  { value: "innovation", label: "Innovation", hint: "New capabilities", color: "#8b5cf6" },
  { value: "modernization", label: "Modernization", hint: "Debt & migrations", color: "#b45309" },
  { value: "run", label: "Run", hint: "Maintain existing", color: "#1e40af" },
] as const;

export const PIPELINE_STAGES = [
  { id: "discovery" as const, label: "Discovery", barClass: "bg-gray-400" },
  { id: "committed" as const, label: "Committed", barClass: "bg-orange-400" },
  { id: "in_flight" as const, label: "In flight", barClass: "bg-blue-500" },
  { id: "blocked" as const, label: "Blocked", barClass: "bg-red-500" },
  { id: "done_ytd" as const, label: "Done YTD", barClass: "bg-emerald-500" },
];

export const PIPELINE_STATUS_LABEL: Record<string, string> = {
  discovery: "Discovery",
  planned: "Committed",
  in_progress: "In flight",
  blocked: "Blocked",
  delivered: "Delivered",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

export interface ResolvedSpend {
  amount: number;
  estimated: boolean;
}

export function resolveRoadmapSpend(props: RoadmapItemProperties): ResolvedSpend {
  if (props.cost != null && props.cost > 0) {
    return { amount: props.cost, estimated: false };
  }
  const effort = props.effort_estimate ?? "";
  const rate = EFFORT_SPEND_RATES[effort];
  if (rate) return { amount: rate, estimated: true };
  return { amount: 0, estimated: true };
}

export function isDeliveredYtd(updatedAt: string, now = new Date()): boolean {
  const d = new Date(updatedAt);
  return d.getFullYear() === now.getFullYear();
}

export function pipelineStageFromItem(
  item: MinEAObject,
  now = new Date()
): PipelineStageId | "excluded" {
  const props = (item.properties ?? {}) as RoadmapItemProperties;
  const status = props.roadmap_status ?? inferRoadmapStatusFromObject(item);

  switch (status) {
    case "discovery":
      return "discovery";
    case "planned":
      return "committed";
    case "in_progress":
      return "in_flight";
    case "blocked":
      return "blocked";
    case "delivered":
      return isDeliveredYtd(item.updated_at, now) ? "done_ytd" : "excluded";
    default:
      return "excluded";
  }
}

function inferRoadmapStatusFromObject(item: MinEAObject): RoadmapItemProperties["roadmap_status"] {
  switch (item.status) {
    case "planned":
      return "planned";
    case "active":
      return "in_progress";
    case "retired":
      return "delivered";
    case "deprecated":
      return "cancelled";
    case "under_evaluation":
      return "deferred";
    default:
      return "discovery";
  }
}

export function isActivePipelineItem(item: MinEAObject): boolean {
  const stage = pipelineStageFromItem(item);
  return stage !== "excluded" && stage !== "done_ytd";
}

export function roadmapSubline(item: MinEAObject): string | null {
  const props = (item.properties ?? {}) as RoadmapItemProperties;
  if (props.roadmap_status === "blocked" && props.blocked_reason?.trim()) {
    return `Blocked — ${props.blocked_reason.trim()}`;
  }
  const debts = props.resolves_debt ?? [];
  if (debts.length === 0) {
    if (props.roadmap_kind === "feature" || props.roadmap_kind === "initiative") {
      return item.description?.trim() ? item.description.slice(0, 60) : null;
    }
    return null;
  }
  const critical = debts.filter((d) => d.severity === "critical").length;
  const high = debts.filter((d) => d.severity === "high").length;
  if (critical > 0) {
    return `Resolves ${critical} critical debt item${critical === 1 ? "" : "s"}`;
  }
  if (high > 0) {
    return `Resolves ${high} high-severity debt item${high === 1 ? "" : "s"}`;
  }
  return `Resolves ${debts.length} debt item${debts.length === 1 ? "" : "s"}`;
}

export interface PipelineStageRollup {
  id: PipelineStageId;
  label: string;
  count: number;
  spend: number;
  barClass: string;
}

export interface InvestmentMixSlice {
  category: InvestmentCategory;
  label: string;
  hint: string;
  color: string;
  spend: number;
  percent: number;
}

export interface PipelineInitiativeRow {
  id: string;
  name: string;
  subline: string | null;
  productId: string | null;
  productName: string | null;
  productCode: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  effort: string;
  spend: number;
  spendEstimated: boolean;
  targetLabel: string;
  blocked: boolean;
}

export interface InvestmentPipelineData {
  lastUpdated: string | null;
  metrics: {
    committedSpend: number;
    activeCount: number;
    inFlightSpend: number;
    inFlightCount: number;
    atRiskCount: number;
    atRiskSpend: number;
    deliveredYtdSpend: number;
    deliveredYtdCount: number;
  };
  stages: PipelineStageRollup[];
  mix: InvestmentMixSlice[];
  mixTotal: number;
  mixInsight: string | null;
  topInitiatives: PipelineInitiativeRow[];
  hasEstimatedSpend: boolean;
}

function productShortCode(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function buildInvestmentPipeline(
  items: MinEAObject[],
  { targetResolutionLabel }: { targetResolutionLabel: (v: string) => string }
): InvestmentPipelineData {
  const stageMap = new Map<PipelineStageId, { count: number; spend: number }>();
  for (const s of PIPELINE_STAGES) {
    stageMap.set(s.id, { count: 0, spend: 0 });
  }

  let committedSpend = 0;
  let activeCount = 0;
  let inFlightSpend = 0;
  let inFlightCount = 0;
  let atRiskCount = 0;
  let atRiskSpend = 0;
  let deliveredYtdSpend = 0;
  let deliveredYtdCount = 0;
  let hasEstimatedSpend = false;

  const mixByCategory: Record<InvestmentCategory, number> = {
    innovation: 0,
    modernization: 0,
    run: 0,
  };

  const rows: PipelineInitiativeRow[] = [];

  let latestUpdate: string | null = null;

  for (const item of items) {
    if (item.type !== "roadmap_item") continue;
    const props = (item.properties ?? {}) as RoadmapItemProperties;
    const stage = pipelineStageFromItem(item);
    if (stage === "excluded") continue;

    const { amount, estimated } = resolveRoadmapSpend(props);
    if (estimated && amount > 0) hasEstimatedSpend = true;

    if (!latestUpdate || item.updated_at > latestUpdate) {
      latestUpdate = item.updated_at;
    }

    const bucket = stageMap.get(stage)!;
    bucket.count += 1;
    bucket.spend += amount;

    if (stage !== "done_ytd") {
      activeCount += 1;
      const category =
        props.investment_category ??
        (defaultInvestmentCategory(props.roadmap_kind ?? "epic") as InvestmentCategory);
      mixByCategory[category] += amount;
    }

    if (stage === "committed" || stage === "in_flight") {
      committedSpend += amount;
    }
    if (stage === "in_flight") {
      inFlightSpend += amount;
      inFlightCount += 1;
    }
    if (stage === "blocked") {
      atRiskCount += 1;
      atRiskSpend += amount;
    }
    if (stage === "done_ytd") {
      deliveredYtdSpend += amount;
      deliveredYtdCount += 1;
    }

    const status = props.roadmap_status ?? inferRoadmapStatusFromObject(item) ?? "discovery";
    rows.push({
      id: item.id,
      name: item.name,
      subline: roadmapSubline(item),
      productId: props.product?.product_id ?? null,
      productName: props.product?.product_name ?? null,
      productCode: props.product?.product_name ? productShortCode(props.product.product_name) : "—",
      typeLabel: props.roadmap_kind
        ? props.roadmap_kind.charAt(0).toUpperCase() + props.roadmap_kind.slice(1)
        : "Item",
      status,
      statusLabel: PIPELINE_STATUS_LABEL[status] ?? status,
      effort: (props.effort_estimate ?? "").toUpperCase() || "—",
      spend: amount,
      spendEstimated: estimated,
      targetLabel: props.target_resolution
        ? targetResolutionLabel(props.target_resolution)
        : "—",
      blocked: status === "blocked",
    });
  }

  const mixTotal = Object.values(mixByCategory).reduce((a, b) => a + b, 0);
  const mix: InvestmentMixSlice[] = INVESTMENT_CATEGORIES.map((cat) => ({
    category: cat.value,
    label: cat.label,
    hint: cat.hint,
    color: cat.color,
    spend: mixByCategory[cat.value],
    percent: mixTotal > 0 ? Math.round((mixByCategory[cat.value] / mixTotal) * 100) : 0,
  }));

  const topCategory = [...mix].sort((a, b) => b.spend - a.spend)[0];
  const mixInsight =
    topCategory && topCategory.spend > 0
      ? `${topCategory.label} is highest — consistent with current debt levels`
      : null;

  const topInitiatives = [...rows]
    .filter((r) => r.status !== "delivered" && r.status !== "cancelled" && r.status !== "deferred")
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  return {
    lastUpdated: latestUpdate,
    metrics: {
      committedSpend,
      activeCount,
      inFlightSpend,
      inFlightCount,
      atRiskCount,
      atRiskSpend,
      deliveredYtdSpend,
      deliveredYtdCount,
    },
    stages: PIPELINE_STAGES.map((s) => ({
      id: s.id,
      label: s.label,
      count: stageMap.get(s.id)!.count,
      spend: stageMap.get(s.id)!.spend,
      barClass: s.barClass,
    })),
    mix,
    mixTotal,
    mixInsight,
    topInitiatives,
    hasEstimatedSpend,
  };
}
