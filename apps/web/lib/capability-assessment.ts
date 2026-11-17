/**
 * Executive-view assessment fields and roll-ups.
 *
 * New values live in objects.properties and relationships.attributes (no migration):
 *   properties.investment_posture: invest | tolerate | migrate | eliminate
 *   properties.investment_posture_override_reason
 *   properties.business_criticality: low | medium | high | critical (tier1 accepted as critical)
 *   properties.technology_fit: 1–5
 *   attributes.disposition on supported_by: keep | consolidate | retire | replace
 *
 * technology_fit default: when properties.technology_fit is not set, use the weakest
 * *explicitly scored* supported_by fitness under the capability (and its activities):
 *   strong → 4, adequate → 3, weak → 2.
 * Missing fitness and explicit "none" are not scored and do not produce a default.
 * (Link-level roll-up still treats missing fitness as adequate — that is unchanged.)
 */
import type { CapEdge, CapObj, FitnessKind, TreeNode } from "@/lib/capability-tree";
import { isActivity, moneyLabel } from "@/lib/capability-tree";
import type { CatalogRow } from "@/lib/model-catalog";

export const POSTURES = ["invest", "tolerate", "migrate", "eliminate"] as const;
export type InvestmentPosture = (typeof POSTURES)[number];

export const BUSINESS_CRITICALITIES = ["low", "medium", "high", "critical"] as const;
export type BusinessCriticality = (typeof BUSINESS_CRITICALITIES)[number];

export const DISPOSITIONS = ["keep", "consolidate", "retire", "replace"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const TECH_FIT_FROM_WEAKEST: Record<Exclude<FitnessKind, "none">, number> = {
  strong: 4,
  adequate: 3,
  weak: 2,
};

const FIT_RANK: Record<Exclude<FitnessKind, "none">, number> = { strong: 3, adequate: 2, weak: 1 };

export function parseInvestmentPosture(raw: unknown): InvestmentPosture | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (POSTURES as readonly string[]).includes(value) ? (value as InvestmentPosture) : null;
}

export function parseBusinessCriticality(raw: unknown): BusinessCriticality | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (value === "tier1" || value === "tier-1" || value === "business-critical") return "critical";
  return (BUSINESS_CRITICALITIES as readonly string[]).includes(value) ? (value as BusinessCriticality) : null;
}

export function parseDisposition(raw: unknown): Disposition | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (DISPOSITIONS as readonly string[]).includes(value) ? (value as Disposition) : null;
}

export function parseTechnologyFit(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

/** Explicit link fitness only. Missing or "none" returns null (unlike parseLinkFitness). */
export function scoredLinkFitness(attributes?: Record<string, unknown> | null): Exclude<FitnessKind, "none"> | null {
  const raw = String(attributes?.fitness ?? "").trim().toLowerCase();
  if (raw === "strong" || raw === "adequate" || raw === "weak") return raw;
  return null;
}

export function weakerScoredFitness(
  a: Exclude<FitnessKind, "none"> | null,
  b: Exclude<FitnessKind, "none"> | null,
): Exclude<FitnessKind, "none"> | null {
  if (!a) return b;
  if (!b) return a;
  return FIT_RANK[a] <= FIT_RANK[b] ? a : b;
}

export function defaultTechnologyFitFromWeakest(fitness: Exclude<FitnessKind, "none"> | null): number | null {
  return fitness ? TECH_FIT_FROM_WEAKEST[fitness] : null;
}

export function ownerIsSet(object: object | null | undefined): boolean {
  if (!object) return false;
  const rec = object as {
    owner?: string | null;
    owner_team_id?: string | null;
    point_of_contact_id?: string | null;
    point_of_contact_name?: string | null;
  };
  return Boolean(
    String(rec.owner ?? "").trim() ||
      rec.owner_team_id ||
      rec.point_of_contact_id ||
      String(rec.point_of_contact_name ?? "").trim(),
  );
}

export type CapabilityAssessment = {
  posture: InvestmentPosture | null;
  overrideReason: string;
  businessCriticality: BusinessCriticality | null;
  /** Stored 1–5, or the default from the weakest scored link. */
  technologyFit: number | null;
  technologyFitSource: "stored" | "default" | null;
  weakestScoredFitness: Exclude<FitnessKind, "none"> | null;
  assessed: boolean;
  exposed: boolean;
};

function propsOf(object: CapObj | undefined): Record<string, unknown> {
  return (object?.properties ?? {}) as Record<string, unknown>;
}

export function weakestScoredFitnessUnder(
  capabilityId: string,
  objects: readonly CapObj[],
  edges: readonly CapEdge[],
): Exclude<FitnessKind, "none"> | null {
  const childIds = new Set<string>([capabilityId]);
  for (const object of objects) {
    if (object.type === "capability" && isActivity(object.properties) && String(object.properties?.parent_id ?? "") === capabilityId) {
      childIds.add(object.id);
    }
  }
  let weakest: Exclude<FitnessKind, "none"> | null = null;
  for (const edge of edges) {
    if (edge.type !== "supported_by" || !childIds.has(edge.from_object_id)) continue;
    weakest = weakerScoredFitness(weakest, scoredLinkFitness(edge.attributes));
  }
  return weakest;
}

export function assessCapability(
  object: CapObj | undefined,
  objects: readonly CapObj[],
  edges: readonly CapEdge[],
): CapabilityAssessment {
  const props = propsOf(object);
  const posture = parseInvestmentPosture(props.investment_posture);
  const businessCriticality = parseBusinessCriticality(props.business_criticality);
  const storedFit = parseTechnologyFit(props.technology_fit);
  const weakestScoredFitness = object ? weakestScoredFitnessUnder(object.id, objects, edges) : null;
  const derivedFit = defaultTechnologyFitFromWeakest(weakestScoredFitness);
  const technologyFit = storedFit ?? derivedFit;
  const technologyFitSource = storedFit ? "stored" : derivedFit ? "default" : null;
  const assessed = Boolean(object && ownerIsSet(object) && businessCriticality && technologyFit && posture);
  const exposed = Boolean(
    assessed &&
      (businessCriticality === "high" || businessCriticality === "critical") &&
      (technologyFit ?? 5) <= 2,
  );
  return {
    posture,
    overrideReason: String(props.investment_posture_override_reason ?? "").trim(),
    businessCriticality,
    technologyFit,
    technologyFitSource,
    weakestScoredFitness,
    assessed,
    exposed,
  };
}

export function appCost(row: CatalogRow | undefined, object: CapObj | undefined): number {
  if (row?.annualCostNumber != null && Number.isFinite(row.annualCostNumber)) return row.annualCostNumber;
  const n = Number((object?.properties as Record<string, unknown> | undefined)?.annual_cost);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Apps marked Retire on any supported_by link, each app counted once (estate-wide or
 * restricted to links whose from_object_id is in `fromIds`).
 */
export function retireSavings(
  objects: readonly CapObj[],
  edges: readonly CapEdge[],
  rows: readonly CatalogRow[] = [],
  fromIds?: ReadonlySet<string>,
): { amount: number; appIds: string[]; appNames: string[] } {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const appIds: string[] = [];
  const appNames: string[] = [];
  let amount = 0;
  for (const edge of edges) {
    if (edge.type !== "supported_by") continue;
    if (fromIds && !fromIds.has(edge.from_object_id)) continue;
    if (parseDisposition(edge.attributes?.disposition) !== "retire") continue;
    if (seen.has(edge.to_object_id)) continue;
    const app = byId.get(edge.to_object_id);
    if (!app || (app.type !== "application" && app.type !== "cloud_service")) continue;
    seen.add(app.id);
    appIds.push(app.id);
    appNames.push(app.name);
    amount += appCost(rowById.get(app.id), app);
  }
  return { amount, appIds, appNames };
}

export type SuggestedPosture = { posture: InvestmentPosture; reason: string };

/**
 * Lean rule for a suggested TIME posture. Used so an override reason can be required.
 *   - all linked apps marked Retire → Eliminate
 *   - any Retire or Consolidate → Migrate
 *   - technology fit ≤ 2 (or weakest scored fitness is weak) → Migrate
 *   - fit ≥ 4 and no gaps → Invest
 *   - otherwise Tolerate, if there is anything to go on
 */
export function suggestInvestmentPosture(
  assessment: CapabilityAssessment,
  node: TreeNode | undefined,
  dispositions: Disposition[],
): SuggestedPosture | null {
  if (dispositions.length && dispositions.every((item) => item === "retire")) {
    return { posture: "eliminate", reason: "Every linked application is marked Retire" };
  }
  if (dispositions.includes("retire") || dispositions.includes("consolidate")) {
    return { posture: "migrate", reason: "A linked application is marked Retire or Consolidate" };
  }
  if (assessment.technologyFit != null && assessment.technologyFit <= 2) {
    return { posture: "migrate", reason: "Technology fit is 2 or less" };
  }
  if (assessment.weakestScoredFitness === "weak") {
    return { posture: "migrate", reason: "The weakest scored app link is weak" };
  }
  if (assessment.technologyFit != null && assessment.technologyFit >= 4 && node && node.coverage === "covered") {
    return { posture: "invest", reason: "Strong technology fit and full coverage" };
  }
  if (assessment.technologyFit != null || dispositions.length || assessment.posture) {
    return { posture: "tolerate", reason: "Fit for purpose until a stronger case to invest or migrate" };
  }
  return null;
}

export type ExecutiveKpis = {
  runCost: { value: number; label: string; empty: boolean; hint: string };
  exposure: { value: number; label: string; empty: boolean; hint: string };
  savings: { value: number; label: string; empty: boolean; hint: string; appCount: number };
  completeness: { assessed: number; total: number; empty: boolean; hint: string };
  /** "in Finance" when scoped to a domain; null for the estate-wide view. */
  scopeLabel: string | null;
};

export type CapabilityRecord = CapObj & {
  owner?: string | null;
  owner_team_id?: string | null;
  point_of_contact_id?: string | null;
  point_of_contact_name?: string | null;
};

export function l2Capabilities(objects: readonly CapObj[]): CapabilityRecord[] {
  return objects.filter((object) => object.type === "capability" && !isActivity(object.properties)) as CapabilityRecord[];
}

export type ExecutiveKpiScope = {
  domainId?: string | null;
  domainName?: string | null;
};

function idsUnder(node: TreeNode): string[] {
  return [node.id, ...node.children.flatMap(idsUnder)];
}

export function executiveKpis(
  objects: readonly CapabilityRecord[],
  edges: readonly CapEdge[],
  rows: readonly CatalogRow[],
  tree: TreeNode[],
  scope?: ExecutiveKpiScope | null,
): ExecutiveKpis {
  const scopedTree = scope?.domainId ? tree.filter((domain) => domain.id === scope.domainId) : tree;
  const capIds = new Set(scopedTree.flatMap((domain) => domain.children.map((child) => child.id)));
  const caps = l2Capabilities(objects).filter((cap) => !scope?.domainId || capIds.has(cap.id));
  const uniqueApps = new Set<string>();
  for (const domain of scopedTree) {
    for (const id of domain.uniqueAppIds) uniqueApps.add(id);
  }
  const byId = new Map(objects.map((object) => [object.id, object]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  let runCost = 0;
  for (const id of uniqueApps) {
    runCost += appCost(rowById.get(id), byId.get(id));
  }
  const assessments = caps.map((cap) => assessCapability(cap, objects, edges));
  const exposed = assessments.filter((item) => item.exposed).length;
  const assessedCount = assessments.filter((item) => item.assessed).length;
  const readyForExposure = assessments.filter(
    (item) => item.businessCriticality && item.technologyFit != null,
  ).length;
  const fromIds = scope?.domainId ? new Set(scopedTree.flatMap(idsUnder)) : undefined;
  const savings = retireSavings(objects, edges, rows, fromIds);

  return {
    runCost: {
      value: runCost,
      label: moneyLabel(runCost),
      empty: runCost <= 0,
      hint: runCost > 0
        ? `Across ${uniqueApps.size} application${uniqueApps.size === 1 ? "" : "s"}`
        : "No spend rolled up yet",
    },
    exposure: {
      value: exposed,
      label: readyForExposure === 0 ? "—" : String(exposed),
      empty: readyForExposure === 0,
      hint:
        readyForExposure === 0
          ? "Set criticality and technology fit to measure exposure"
          : exposed === 1
            ? "Critical capability on poor-fit technology"
            : "Critical capabilities on poor-fit technology",
    },
    savings: {
      value: savings.amount,
      label: savings.appIds.length === 0 ? "—" : moneyLabel(savings.amount),
      empty: savings.appIds.length === 0,
      hint:
        savings.appIds.length === 0
          ? "No applications marked Retire"
          : `Estimated annual savings from ${savings.appIds.length} retired application${savings.appIds.length === 1 ? "" : "s"}`,
      appCount: savings.appIds.length,
    },
    completeness: {
      assessed: assessedCount,
      total: caps.length,
      empty: caps.length === 0 || assessedCount === 0,
      hint:
        caps.length === 0
          ? "No capabilities yet"
          : assessedCount === caps.length
            ? "Every capability is assessed"
            : "Assessed when owner, criticality, fit and posture are set",
    },
    scopeLabel: scope?.domainId ? `in ${scope.domainName || scopedTree[0]?.name || "this domain"}` : null,
  };
}

export function postureLabel(posture: InvestmentPosture | null): string {
  if (!posture) return "Not assessed";
  return posture[0]!.toUpperCase() + posture.slice(1);
}

export function criticalityLabel(value: BusinessCriticality | null): string {
  if (!value) return "Not assessed";
  return value === "critical" ? "Critical" : value[0]!.toUpperCase() + value.slice(1);
}

export function dispositionLabel(value: Disposition | null): string {
  if (!value) return "—";
  return value[0]!.toUpperCase() + value.slice(1);
}

export function technologyFitLabel(value: number | null, source?: CapabilityAssessment["technologyFitSource"]): string {
  if (value == null) return "Not assessed";
  const base = `Tech fit ${value} of 5`;
  return source === "default" ? `${base} (from link fitness)` : base;
}

function domainOrder(object: CapObj): number {
  const n = Number(object.properties?.order_index);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function compareDomainOrder(a: CapObj, b: CapObj): number {
  const delta = domainOrder(a) - domainOrder(b);
  return delta !== 0 ? delta : a.name.localeCompare(b.name);
}
