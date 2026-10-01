import type { CatalogRow } from "@/lib/model-catalog";
import { catalogStats, moneyLabel } from "@/lib/model-catalog";
import { runDollarsTotal } from "@/lib/cost/service";
import { hostSourceIds, noHostLinked, readPlatformInfra, readRuntimeInfra } from "@/lib/infra/read";
import { agingSummary, infraStatus } from "@/lib/infra/status";
import { impactOf, type ImpactEdge, type ImpactNode } from "@/lib/impact/relationship-impact";

export type HomeEdge = { type: string; fromId: string; toId: string };

export type SpofHost = {
  id: string;
  name: string;
  kind: "platform" | "runtime";
  typeLine: string;
  statusLabel: string | null;
  count: number;
  dependents: { id: string; name: string; criticalityLabel: string }[];
};

export const REPORT_REGISTRY = [
  { id: "renewals", category: "cost", title: "Renewals next 90 days", body: "What contracts come up before Dec 24, and what do they cost?" },
  { id: "spend", category: "cost", title: "Spend by vendor & category", body: "Where is our money going, and to whom?" },
  { id: "infrastructure-cost", category: "cost", title: "Infrastructure cost", body: "What do our platforms, servers and devices cost a year?" },
  { id: "impact", category: "risk", title: "Impact analysis", body: "What breaks if a system or vendor fails?" },
  { id: "aging", category: "risk", title: "Aging infrastructure", body: "What is out of support, on an unsupported OS, or ending soon?" },
  { id: "hosting", category: "risk", title: "Hosting map", body: "Which apps run on which platform or server, and which have no host linked?" },
  { id: "end-of-life", category: "risk", title: "End of life & retiring", body: "What is being phased out or losing vendor support?" },
  { id: "single-points", category: "risk", title: "Single points of failure", body: "Which platform or server has 3 or more things running on or built on it?" },
  { id: "ownership-gaps", category: "ownership", title: "Ownership gaps", body: "Which systems have nobody accountable for them?" },
  { id: "sensitive-vendors", category: "ownership", title: "Vendors holding sensitive data", body: "Which vendors store customer, employee, or financial data?" },
  { id: "tech-debt", category: "ownership", title: "Tech debt summary", body: "What known problems are we carrying, and where?" },
] as const;

export function reportCounts() {
  const all = REPORT_REGISTRY.length;
  const cost = REPORT_REGISTRY.filter((item) => item.category === "cost").length;
  const risk = REPORT_REGISTRY.filter((item) => item.category === "risk").length;
  const ownership = REPORT_REGISTRY.filter((item) => item.category === "ownership").length;
  return { all, cost, risk, ownership };
}

function prettyDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function withArticle(name: string, runtime: boolean): string {
  if (!runtime) return name;
  return /^the\s/i.test(name.trim()) ? name : `the ${name}`;
}

function nodesOf(rows: CatalogRow[]): ImpactNode[] {
  return rows.map((row) => ({ id: row.id, name: row.name, typeLabel: row.typeLabel }));
}

function hostDependents(row: CatalogRow, rows: CatalogRow[], edges: HomeEdge[]) {
  const ids = hostSourceIds(row.id, edges);
  const byId = new Map(rows.map((item) => [item.id, item]));
  return {
    count: ids.length,
    dependents: ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [{ id: item.id, name: item.name, criticalityLabel: item.criticalityLabel }] : [];
    }),
  };
}

export function singlePoints(rows: CatalogRow[], edges: HomeEdge[], today = new Date()): SpofHost[] {
  return rows
    .filter((row) => row.kind === "platform" || row.kind === "runtime")
    .map((row) => {
      const hosted = hostDependents(row, rows, edges);
      const platform = row.kind === "platform" ? readPlatformInfra(row.object) : null;
      const runtime = row.kind === "runtime" ? readRuntimeInfra(row.object) : null;
      const status = runtime ? infraStatus(runtime, today) : null;
      return {
        id: row.id,
        name: row.name,
        kind: row.kind as "platform" | "runtime",
        typeLine: platform ? `Platform · ${platform.kindLabel || "Platform"}` : `Server & device · ${runtime?.kindLabel || "Server"}`,
        statusLabel: status && status.status !== "unknown" && status.status !== "ok" ? status.label : status?.status === "ok" ? null : null,
        count: hosted.count,
        dependents: hosted.dependents,
      };
    })
    .filter((host) => host.count >= 3)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function hostingMap(rows: CatalogRow[], edges: HomeEdge[]) {
  const apps = rows.filter((row) => row.kind === "application");
  const hosts = new Set<string>();
  let unlinked = 0;
  for (const app of apps) {
    const linked = edges.filter(
      (edge) => edge.fromId === app.id && (edge.type === "runs_on" || edge.type === "built_on"),
    );
    if (noHostLinked({ type: app.object.type, properties: (app.object.properties ?? {}) as Record<string, unknown> }, edges, app.id)) {
      unlinked += 1;
    }
    for (const edge of linked) hosts.add(edge.toId);
  }
  return { hosts: hosts.size, unlinked };
}

export function supportCounts(rows: CatalogRow[], today = new Date()) {
  const aging = agingSummary(rows.filter((row) => row.kind === "runtime").map((row) => readRuntimeInfra(row.object)), today);
  return { out: aging.outOfSupportOrOs, soon: aging.endsSoon };
}

export function askChips(rows: CatalogRow[], edges: HomeEdge[], today = new Date()): string[] {
  const stats = catalogStats(rows);
  const servers = rows.filter((row) => row.kind === "runtime");
  const aging = agingSummary(servers.map((row) => readRuntimeInfra(row.object)), today);
  const chips: string[] = [];
  if (aging.outOfSupportOrOs > 0) chips.push("What's out of support?");
  const busiestRuntime = [...servers].sort((a, b) => hostSourceIds(b.id, edges).length - hostSourceIds(a.id, edges).length)[0];
  if (busiestRuntime && hostSourceIds(busiestRuntime.id, edges).length > 0) {
    chips.push(`What breaks if ${withArticle(busiestRuntime.name, true)} goes down?`);
  }
  chips.push(stats.renewals.length > 0 ? "What renews in the next 90 days?" : "When is our next renewal?");
  if (stats.noOwner.length > 0) chips.push("What has no owner?");
  if (stats.spend > 0) chips.push("What are we spending by vendor?");
  const graphNodes = nodesOf(rows);
  const graphEdges = edges as ImpactEdge[];
  const busiestApp = [...rows.filter((row) => row.kind === "application")].sort(
    (a, b) => impactOf(graphNodes, graphEdges, b.id).length - impactOf(graphNodes, graphEdges, a.id).length,
  )[0];
  if (busiestApp && impactOf(graphNodes, graphEdges, busiestApp.id).length > 0) {
    chips.push(`What happens if ${withArticle(busiestApp.name, false)} goes down?`);
  }
  return chips.slice(0, 6);
}

export type CardCopy = { value: string; detail: string; alert: boolean };

export function popularCards(
  rows: CatalogRow[],
  edges: HomeEdge[],
  today = new Date(),
  emptyPreview = false,
): { renewals: CardCopy; spend: CardCopy; ownership: CardCopy; aging: CardCopy } {
  const stats = catalogStats(rows);
  const servers = rows.filter((row) => row.kind === "runtime");
  const aging = agingSummary(servers.map((row) => readRuntimeInfra(row.object)), today);
  const nextRenewal = [...rows].filter((row) => row.renewalDate).sort((a, b) => (a.renewalDate!.getTime() - b.renewalDate!.getTime()))[0];
  const anyRenewal = rows.some((row) => row.renewalDate || (row.renewalLabel && row.renewalLabel !== "—"));
  const renewalsInWindow = emptyPreview ? [] : stats.renewals;
  const ownersMissing = emptyPreview ? [] : stats.noOwner;
  const out = emptyPreview ? 0 : aging.outOfSupportOrOs;
  const soon = emptyPreview ? 0 : aging.endsSoon;
  const nextSupport = aging.items
    .map((item) => ({ name: item.runtime.name ?? "", date: item.status.effectiveDate, status: item.status.status }))
    .filter((item) => item.date && item.status !== "out_of_support" && item.status !== "unsupported_os")
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];

  const renewals: CardCopy = renewalsInWindow.length
    ? { value: String(renewalsInWindow.length), detail: `renewals · ${moneyLabel(stats.renewalSpend)}`, alert: false }
    : anyRenewal && nextRenewal
      ? { value: "Nothing in 90 days", detail: `next ${nextRenewal.renewalLabel} · ${nextRenewal.name}`, alert: false }
      : { value: "No renewal dates yet", detail: "Add", alert: false };

  const spend: CardCopy = stats.spend > 0
    ? { value: moneyLabel(stats.spend), detail: `/ yr · ${stats.vendorCount} vendors`, alert: false }
    : { value: "No costs tracked yet", detail: "Add", alert: false };

  const ownership: CardCopy = ownersMissing.length
    ? { value: String(ownersMissing.length), detail: `with no owner · ${ownersMissing.slice(0, 3).map((row) => row.name).join(", ")}`, alert: false }
    : { value: "Every record has an owner", detail: "nothing to fill in", alert: false };

  const agingCard: CardCopy = out > 0
    ? { value: `${out} out of support`, detail: `${soon} ending in 90 days`, alert: true }
    : nextSupport
      ? { value: "Nothing out of support", detail: `next support end ${prettyDate(nextSupport.date!)} · ${nextSupport.name}`, alert: false }
      : { value: "Nothing out of support", detail: "No support dates yet", alert: false };

  return { renewals, spend, ownership, aging: agingCard };
}

export function infraCost(rows: CatalogRow[]) {
  const platforms = runDollarsTotal(rows.filter((row) => row.kind === "platform").map((row) => (row.object.properties ?? {}) as Record<string, unknown>));
  const servers = runDollarsTotal(rows.filter((row) => row.kind === "runtime").map((row) => (row.object.properties ?? {}) as Record<string, unknown>));
  return { platforms, servers, total: platforms + servers };
}

export function topHostLine(rows: CatalogRow[], edges: HomeEdge[]): string {
  const hosts = rows.filter((row) => row.kind === "platform" || row.kind === "runtime");
  const top = [...hosts].sort((a, b) => hostSourceIds(b.id, edges).length - hostSourceIds(a.id, edges).length)[0];
  if (!top) return "From your relationships";
  const count = hostSourceIds(top.id, edges).length;
  if (!count) return "From your relationships";
  return `${top.name} → ${count} apps run on it`;
}
