/**
 * 3-level capability tree and rolled-up heat (coverage, apps, cost, criticality).
 * An app linked at any level counts once per ancestor, not once per node it appears under.
 */
import type { CatalogRow } from "@/lib/model-catalog";

export type CapObj = {
  id: string;
  type: string;
  name: string;
  status?: string | null;
  properties?: Record<string, unknown> | null;
};
export type CapEdge = { type: string; from_object_id: string; to_object_id: string };

export type HeatMetric = "coverage" | "apps" | "cost" | "risk";
export type HeatDepth = "l1" | "l2" | "l3";
export type CoverageKind = "gap" | "partial" | "mostly" | "covered";
export type RiskKind = "none" | "low" | "med" | "high";

export type TreeNode = {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  domainId: string | null;
  parentId: string | null;
  children: TreeNode[];
  appIds: string[];
  uniqueAppIds: string[];
  cost: number;
  risk: RiskKind;
  coverage: CoverageKind;
  leafCount: number;
  coveredLeaves: number;
};

export function isActivity(properties: Record<string, unknown> | null | undefined): boolean {
  const parent = properties?.parent_id;
  const domain = properties?.domain_id;
  return Boolean(parent) && String(parent) !== String(domain ?? "");
}

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function money(row: CatalogRow | undefined, object: CapObj): number {
  if (row?.annualCostNumber != null && Number.isFinite(row.annualCostNumber)) return row.annualCostNumber;
  const props = (row?.effective ?? row?.object ?? object).properties ?? object.properties ?? {};
  const n = Number((props as Record<string, unknown>).annual_cost);
  return Number.isFinite(n) ? n : 0;
}

function riskOf(row: CatalogRow | undefined, object: CapObj): RiskKind {
  const props = ((row?.effective ?? row?.object ?? object).properties ?? object.properties ?? {}) as Record<string, unknown>;
  const raw = String(row?.criticality || props.criticality || "").toLowerCase();
  if (raw === "critical" || raw === "high" || raw === "business-critical") return "high";
  if (raw === "medium" || raw === "med") return "med";
  return "low";
}

function coverage(coveredLeaves: number, leafCount: number, hasApps: boolean): CoverageKind {
  if (leafCount === 0) return hasApps ? "covered" : "gap";
  if (coveredLeaves === 0) return hasApps ? "partial" : "gap";
  if (coveredLeaves === leafCount) return "covered";
  if (coveredLeaves / leafCount >= 0.6) return "mostly";
  return "partial";
}

function worse(a: RiskKind, b: RiskKind): RiskKind {
  const order: RiskKind[] = ["none", "low", "med", "high"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

function finish(node: TreeNode, appById: Map<string, { cost: number; risk: RiskKind }>): TreeNode {
  const childResults = node.children.map((child) => finish(child, appById));
  const fromChildren = childResults.flatMap((child) => child.uniqueAppIds);
  const unique = [...new Set([...node.appIds, ...fromChildren])];
  const cost = unique.reduce((sum, id) => sum + (appById.get(id)?.cost ?? 0), 0);
  const risk = unique.reduce<RiskKind>((acc, id) => worse(acc, appById.get(id)?.risk ?? "low"), unique.length ? "low" : "none");
  const leafCount = childResults.length ? childResults.reduce((sum, child) => sum + child.leafCount, 0) : 1;
  const coveredLeaves = childResults.length
    ? childResults.reduce((sum, child) => sum + child.coveredLeaves, 0)
    : unique.length ? 1 : 0;
  return {
    ...node,
    children: childResults,
    uniqueAppIds: unique,
    cost,
    risk,
    leafCount,
    coveredLeaves,
    coverage: coverage(coveredLeaves, leafCount, unique.length > 0),
  };
}

export function buildCapabilityTree(
  objects: readonly CapObj[],
  edges: readonly CapEdge[],
  rows: readonly CatalogRow[] = [],
): TreeNode[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const apps = objects.filter((object) => object.type === "application" || object.type === "cloud_service");
  const appById = new Map(apps.map((app) => [app.id, { cost: money(rowById.get(app.id), app), risk: riskOf(rowById.get(app.id), app) }]));
  const linked = new Map<string, string[]>();
  const appIds = new Set(appById.keys());
  for (const edge of edges) {
    if (edge.type !== "supported_by" || !appIds.has(edge.to_object_id)) continue;
    linked.set(edge.from_object_id, [...(linked.get(edge.from_object_id) ?? []), edge.to_object_id]);
  }

  const domains = objects.filter((object) => object.type === "business_domain").sort((a, b) => a.name.localeCompare(b.name));
  const caps = objects.filter((object) => object.type === "capability");
  const knownDomains = new Set(domains.map((d) => d.id));
  const l2: CapObj[] = [];
  const l3ByParent = new Map<string, CapObj[]>();
  for (const cap of caps) {
    if (isActivity(cap.properties)) {
      const parent = String(cap.properties?.parent_id ?? "");
      l3ByParent.set(parent, [...(l3ByParent.get(parent) ?? []), cap]);
    } else {
      l2.push(cap);
    }
  }

  const make = (object: CapObj, level: 1 | 2 | 3, domainId: string | null, parentId: string | null, children: TreeNode[]): TreeNode => ({
    id: object.id,
    name: object.name,
    level,
    domainId,
    parentId,
    children,
    appIds: [...new Set(linked.get(object.id) ?? [])],
    uniqueAppIds: [],
    cost: 0,
    risk: "none",
    coverage: "gap",
    leafCount: 0,
    coveredLeaves: 0,
  });

  const l2Under = (domainId: string | null) =>
    l2
      .filter((cap) => {
        const did = String(cap.properties?.domain_id ?? "");
        return domainId ? did === domainId : !did || !knownDomains.has(did);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((cap) => {
        const kids = (l3ByParent.get(cap.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((act) => make(act, 3, domainId, cap.id, []));
        return make(cap, 2, domainId, domainId, kids);
      });

  const trees = domains.map((domain) => make(domain, 1, domain.id, null, l2Under(domain.id)));
  const orphans = l2Under(null);
  if (orphans.length) {
    trees.push({
      id: "no-domain",
      name: "No domain",
      level: 1,
      domainId: null,
      parentId: null,
      children: orphans,
      appIds: [],
      uniqueAppIds: [],
      cost: 0,
      risk: "none",
      coverage: "gap",
      leafCount: 0,
      coveredLeaves: 0,
    });
  }
  return trees.map((node) => finish(node, appById));
}

export function flatten(nodes: readonly TreeNode[], depth: HeatDepth): TreeNode[] {
  if (depth === "l1") return [...nodes];
  if (depth === "l2") return nodes.flatMap((d) => d.children);
  return nodes.flatMap((d) => d.children.flatMap((c) => (c.children.length ? c.children : [c])));
}

export function heatClass(node: TreeNode, metric: HeatMetric): string {
  if (metric === "coverage") {
    return { gap: "c-gap", partial: "c-fair", mostly: "c-ok", covered: "c-good" }[node.coverage];
  }
  if (metric === "apps") {
    const n = node.uniqueAppIds.length;
    return n === 0 ? "a-0" : n <= 2 ? "a-1" : n <= 5 ? "a-2" : "a-3";
  }
  if (metric === "cost") {
    if (!node.cost) return "cost-0";
    if (node.cost < 80_000) return "cost-1";
    if (node.cost < 250_000) return "cost-2";
    return "cost-3";
  }
  return { none: "cost-0", low: "r-low", med: "r-med", high: "r-high" }[node.risk];
}

export function heatMeta(node: TreeNode, metric: HeatMetric): string {
  if (metric === "apps") return `${node.uniqueAppIds.length} app${node.uniqueAppIds.length === 1 ? "" : "s"}`;
  if (metric === "cost") return node.cost ? `$${Math.round(node.cost).toLocaleString("en-US")}` : "—";
  if (metric === "risk") return { none: "No apps", low: "Low", med: "Medium", high: "Critical app" }[node.risk];
  if (node.coverage === "gap") return "No app";
  if (node.coverage === "covered") return "Covered";
  if (node.coverage === "mostly") return "Mostly covered";
  if (node.leafCount) return `${node.coveredLeaves} of ${node.leafCount} activities covered`;
  return "Partial";
}

export function moneyLabel(value: number): string {
  if (!value) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2).replace(/\.00$/, "")}M`;
  if (value >= 1_000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
