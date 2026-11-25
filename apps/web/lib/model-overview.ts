/** Data for the Model Overview: gaps, cost by area, risks, and next actions. */

import { catalogStats, moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { l2Capabilities, ownerIsSet } from "@/lib/capability-assessment";
import { buildCapabilityTree, type TreeNode } from "@/lib/capability-tree";
import { capabilityRows } from "@/lib/capabilities";
import { isShadowGovernance, systemGovernanceStatus } from "@/lib/system-governance";
import { agingSummary } from "@/lib/infra/status";
import { readRuntimeInfra } from "@/lib/infra/read";
import type { MinEAObject, Relationship } from "@minea/types";

export type OverviewGap = {
  id: string;
  severity: "error" | "warn";
  message: string;
  href?: string;
};

export type DomainCost = {
  id: string;
  name: string;
  cost: number;
  costLabel: string;
};

export type OverviewRisks = {
  shadow: number;
  unownedCaps: number;
  unownedApps: number;
  renewals: number;
  endOfLife: number;
  aging: number;
};

export type OverviewAction = {
  id: string;
  label: string;
  href?: string;
};

export type OverviewLens = "coverage" | "support";

export function overviewCapabilityEmpty(objects: readonly MinEAObject[]): boolean {
  return l2Capabilities(objects).length === 0 && !objects.some((object) => object.type === "capability");
}

export function overviewGaps(
  objects: readonly MinEAObject[],
  relationships: readonly Relationship[],
  hrefFor: (id: string) => string,
): OverviewGap[] {
  const rows = capabilityRows(objects as MinEAObject[], relationships as Relationship[]).filter((row) =>
    l2Capabilities(objects).some((cap) => cap.id === row.id),
  );
  const gaps: OverviewGap[] = [];
  for (const row of rows) {
    if (row.gap) {
      gaps.push({
        id: `no-system-${row.id}`,
        severity: "error",
        message: `${row.name} has no system mapped`,
        href: hrefFor(row.id),
      });
    }
  }
  for (const row of rows) {
    if (!row.gap && !row.owner) {
      gaps.push({
        id: `unowned-${row.id}`,
        severity: "warn",
        message: `${row.name} has no owner`,
        href: hrefFor(row.id),
      });
    }
  }
  return gaps;
}

/** Estate total counts each application once; per-domain figures follow the capability tree (executive view). */
export function overviewCostByDomain(
  objects: readonly MinEAObject[],
  relationships: readonly Relationship[],
  rows: readonly CatalogRow[],
): { domains: DomainCost[]; total: number; totalLabel: string; appsWithCost: number } {
  const tree = buildCapabilityTree(objects as MinEAObject[], relationships as Relationship[], rows as CatalogRow[]);
  const domains = tree
    .filter((node) => node.id !== "no-domain")
    .map((node) => ({
      id: node.id,
      name: node.name,
      cost: node.cost,
      costLabel: node.cost ? moneyLabel(node.cost) : "—",
    }));
  // Estate total counts each application once, including apps not yet on the map.
  const unique = new Set<string>();
  for (const domain of tree) {
    for (const id of domain.uniqueAppIds) unique.add(id);
  }
  for (const object of objects) {
    if (object.type === "application") unique.add(object.id);
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  let total = 0;
  let appsWithCost = 0;
  for (const id of unique) {
    const amount = rowById.get(id)?.annualCostNumber ?? 0;
    if (amount) {
      total += amount;
      appsWithCost += 1;
    }
  }
  return { domains, total, totalLabel: total ? moneyLabel(total) : "—", appsWithCost };
}

export function overviewRisks(objects: readonly MinEAObject[], rows: readonly CatalogRow[], now = new Date()): OverviewRisks {
  const stats = catalogStats(rows as CatalogRow[]);
  const apps = objects.filter((object) => object.type === "application");
  const shadow = apps.filter((object) =>
    isShadowGovernance(systemGovernanceStatus(object.properties as Parameters<typeof systemGovernanceStatus>[0])),
  ).length;
  const unownedCaps = l2Capabilities(objects).filter((cap) => !ownerIsSet(cap)).length;
  const unownedApps = stats.noOwner.filter((row) => row.kind === "application").length;
  const aging = agingSummary(
    rows.filter((row) => row.kind === "runtime").map((row) => readRuntimeInfra(row.object)),
    now,
  );
  return {
    shadow,
    unownedCaps,
    unownedApps,
    renewals: stats.renewals.length,
    endOfLife: stats.endOfLife.length,
    aging: aging.outOfSupportOrOs + aging.endsSoon,
  };
}

export function endingCount(risks: OverviewRisks): number {
  return risks.renewals + risks.endOfLife + risks.aging;
}

export function unownedSentence(risks: OverviewRisks): string {
  const caps = risks.unownedCaps;
  const apps = risks.unownedApps;
  const capPart = caps === 1 ? "1 capability" : `${caps} capabilities`;
  const appPart = apps === 1 ? "1 application" : `${apps} applications`;
  if (caps && apps) return `${capPart} and ${appPart} have no owner.`;
  if (caps) return `${capPart} ${caps === 1 ? "has" : "have"} no owner.`;
  if (apps) return `${appPart} ${apps === 1 ? "has" : "have"} no owner.`;
  return "";
}

export function endingSentence(risks: OverviewRisks): string {
  const parts: string[] = [];
  if (risks.renewals) {
    parts.push(risks.renewals === 1 ? "1 contract due in 90 days" : `${risks.renewals} contracts due in 90 days`);
  }
  if (risks.endOfLife) {
    parts.push(risks.endOfLife === 1 ? "1 application at end of life" : `${risks.endOfLife} applications at end of life`);
  }
  if (risks.aging) {
    parts.push(risks.aging === 1 ? "1 server needs attention" : `${risks.aging} servers need attention`);
  }
  return parts.join(", ") + (parts.length ? "." : "");
}

export function overviewActions(
  gaps: OverviewGap[],
  risks: OverviewRisks,
  hrefs: { renewals?: string; applications?: string },
): OverviewAction[] {
  const actions: OverviewAction[] = [];
  const unmapped = gaps.find((gap) => gap.message.includes("no system mapped"));
  if (unmapped) {
    const name = unmapped.message.replace(" has no system mapped", "");
    actions.push({ id: unmapped.id, label: `Map a system to ${name}`, href: unmapped.href });
  }
  const unowned = gaps.find((gap) => gap.message.includes("no owner"));
  if (unowned) {
    const name = unowned.message.replace(" has no owner", "");
    actions.push({ id: unowned.id, label: `Assign an owner to ${name}`, href: unowned.href });
  }
  if (risks.renewals > 0 && hrefs.renewals) {
    const label = risks.renewals === 1
      ? "Review 1 contract due in the next 90 days"
      : `Review ${risks.renewals} contracts due in the next 90 days`;
    actions.push({ id: "renewals", label, href: hrefs.renewals });
  }
  if (actions.length < 3 && risks.shadow > 0 && hrefs.applications) {
    const label = risks.shadow === 1
      ? "Classify 1 application that is outside IT"
      : `Classify ${risks.shadow} applications that are outside IT`;
    actions.push({ id: "shadow", label, href: hrefs.applications });
  }
  return actions.slice(0, 3);
}

export function domainStripMeta(domain: TreeNode, lens: OverviewLens): string {
  const caps = domain.children;
  if (lens === "support") {
    const scored = caps.filter((child) => child.fitness !== "none");
    const weak = scored.filter((child) => child.fitness === "weak").length;
    return scored.length ? `${weak} weak of ${scored.length} scored` : "No scores yet";
  }
  const covered = caps.filter((child) => child.coverage === "covered").length;
  return `${covered} of ${caps.length} covered`;
}
