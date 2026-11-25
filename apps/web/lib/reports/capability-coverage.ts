/** Capability coverage report: assembles Overview and map figures. No new metrics. */

import { buildCapabilityTree, heatClass, heatMeta, type TreeNode } from "@/lib/capability-tree";
import {
  domainStripMeta,
  overviewCapabilityEmpty,
  overviewGaps,
} from "@/lib/model-overview";
import type { CatalogRow } from "@/lib/model-catalog";
import type { CardCopy } from "@/lib/reports/home";
import type { MinEAObject, Relationship } from "@minea/types";

export const CAPABILITY_COVERAGE_REPORT_ID = "capability-coverage";

export type CoverageListItem = {
  id: string;
  name: string;
  domain: string;
  status: string;
};

export type CoverageDomainRow = {
  id: string;
  name: string;
  meta: string;
  caps: { id: string; name: string; coverage: TreeNode["coverage"]; heatClass: string }[];
};

export type CapabilityCoverageModel = {
  empty: boolean;
  card: CardCopy;
  covered: number;
  total: number;
  lede: string;
  noSystem: CoverageListItem[];
  partial: CoverageListItem[];
  weak: CoverageListItem[];
  single: CoverageListItem[];
  domains: CoverageDomainRow[];
};

function domainNameFor(node: TreeNode, domains: readonly TreeNode[]): string {
  if (!node.domainId) return "No domain";
  return domains.find((domain) => domain.id === node.domainId)?.name ?? "No domain";
}

function walkL2(tree: readonly TreeNode[]): TreeNode[] {
  return tree.flatMap((domain) => domain.children);
}

function appName(id: string, objects: readonly MinEAObject[]): string {
  return objects.find((object) => object.id === id)?.name ?? "One app";
}

function weakReason(node: TreeNode): string {
  const hint = node.fitnessHint ?? "";
  const cut = hint.lastIndexOf(" on ");
  const app = cut > 0 ? hint.slice(0, cut) : hint;
  return app ? `${app} is a weak fit` : "A linked system is a weak fit";
}

function partialStatus(node: TreeNode): string {
  if (node.coverage === "mostly") {
    return node.leafCount
      ? `Mostly covered · ${node.coveredLeaves} of ${node.leafCount} activities`
      : "Mostly covered";
  }
  if (node.leafCount) return `${node.coveredLeaves} of ${node.leafCount} activities covered`;
  return heatMeta(node, "coverage");
}

function ledeCopy(covered: number, total: number, noSystem: number, partial: number): string {
  const unit = total === 1 ? "capability" : "capabilities";
  const verb = covered === 1 ? "has" : "have";
  const head =
    covered === total && total > 0
      ? `All ${total} ${unit} have a system in place.`
      : `${covered} of ${total} ${unit} ${verb} a system in place.`;
  const parts: string[] = [];
  if (noSystem) parts.push(`${noSystem} ${noSystem === 1 ? "has" : "have"} no system at all`);
  if (partial) parts.push(`${partial} ${partial === 1 ? "is" : "are"} only partly covered`);
  if (!parts.length) return head;
  return `${head} ${parts.join(", and ")}.`;
}

export function coverageCardCopy(
  objects: readonly MinEAObject[],
  relationships: readonly Relationship[],
  rows: readonly CatalogRow[] = [],
): CardCopy {
  return capabilityCoverage(objects, relationships, rows).card;
}

export function capabilityCoverage(
  objects: readonly MinEAObject[],
  relationships: readonly Relationship[],
  rows: readonly CatalogRow[] = [],
): CapabilityCoverageModel {
  const empty = overviewCapabilityEmpty(objects);
  const tree = buildCapabilityTree(objects, relationships, rows);
  const domains = tree.filter((node) => node.id !== "no-domain");
  const displayDomains = tree.filter((node) => node.id !== "no-domain" || node.children.length > 0);
  const allL2 = walkL2(tree);
  const coveredNodes = allL2.filter((node) => node.coverage === "covered");
  const partialNodes = allL2.filter((node) => node.coverage === "partial" || node.coverage === "mostly");
  const weakNodes = allL2.filter((node) => node.fitness === "weak");
  const singleNodes = allL2.filter((node) => node.uniqueAppIds.length === 1);
  const gaps = overviewGaps(objects, relationships, (id) => id);
  const noSystemGaps = gaps.filter((gap) => gap.message.includes("no system mapped"));
  const byId = new Map(allL2.map((node) => [node.id, node]));

  const noSystem: CoverageListItem[] = noSystemGaps.map((gap) => {
    const id = gap.id.replace(/^no-system-/, "");
    const node = byId.get(id);
    const name = gap.message.replace(" has no system mapped", "");
    return {
      id,
      name,
      domain: node ? domainNameFor(node, tree) : "",
      status: "No system",
    };
  });

  const card: CardCopy = empty
    ? { value: "No capability map yet", detail: "Add", alert: false }
    : noSystem.length
      ? {
          value: `${coveredNodes.length} of ${allL2.length} capabilities covered`,
          detail: `${noSystem.length} with no system · ${noSystem
            .slice(0, 3)
            .map((item) => item.name)
            .join(", ")}`,
          alert: false,
        }
      : {
          value: `${coveredNodes.length} of ${allL2.length} capabilities covered`,
          detail: "Every capability has a system",
          alert: false,
        };

  return {
    empty,
    card,
    covered: coveredNodes.length,
    total: allL2.length,
    lede: empty
      ? "There is no capability map yet, so this report has nothing to count. Describe the business here and we will suggest a starting map. Nothing is saved until you use it."
      : ledeCopy(coveredNodes.length, allL2.length, noSystem.length, partialNodes.length),
    noSystem,
    partial: partialNodes.map((node) => ({
      id: node.id,
      name: node.name,
      domain: domainNameFor(node, tree),
      status: partialStatus(node),
    })),
    weak: weakNodes.map((node) => ({
      id: node.id,
      name: node.name,
      domain: domainNameFor(node, tree),
      status: weakReason(node),
    })),
    single: singleNodes.map((node) => ({
      id: node.id,
      name: node.name,
      domain: domainNameFor(node, tree),
      status: appName(node.uniqueAppIds[0]!, objects),
    })),
    domains: displayDomains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      meta: domainStripMeta(domain, "coverage"),
      caps: domain.children.map((cap) => ({
        id: cap.id,
        name: cap.name,
        coverage: cap.coverage,
        heatClass: heatClass(cap, "coverage"),
      })),
    })),
  };
}
