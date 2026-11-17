import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessCapability,
  defaultTechnologyFitFromWeakest,
  executiveKpis,
  parseBusinessCriticality,
  parseDisposition,
  parseInvestmentPosture,
  parseTechnologyFit,
  retireSavings,
  scoredLinkFitness,
  suggestInvestmentPosture,
  weakerScoredFitness,
  domainIdentityColor,
  DOMAIN_IDENTITY_PALETTE,
  domainLensRollup,
  isExecutiveTileMuted,
  l2Capabilities,
  orderedDomainIdsFromTree,
  type CapabilityRecord,
} from "./capability-assessment";
import { buildCapabilityTree, type CapEdge, type CapObj } from "./capability-tree";
import type { CatalogRow } from "./model-catalog";

const obj = (id: string, type: string, name: string, extra: Partial<CapabilityRecord> = {}): CapabilityRecord => ({
  id,
  type,
  name,
  properties: {},
  ...extra,
  properties: { ...(extra.properties ?? {}) },
});

const edge = (from: string, to: string, attributes: Record<string, unknown> = {}): CapEdge => ({
  type: "supported_by",
  from_object_id: from,
  to_object_id: to,
  attributes,
});

const row = (id: string, annualCostNumber: number): CatalogRow =>
  ({ id, annualCostNumber }) as CatalogRow;

test("technology_fit defaults from the weakest scored link only", () => {
  assert.equal(defaultTechnologyFitFromWeakest("strong"), 4);
  assert.equal(defaultTechnologyFitFromWeakest("adequate"), 3);
  assert.equal(defaultTechnologyFitFromWeakest("weak"), 2);
  assert.equal(defaultTechnologyFitFromWeakest(null), null);
  assert.equal(scoredLinkFitness({}), null);
  assert.equal(scoredLinkFitness({ fitness: "none" }), null);
  assert.equal(scoredLinkFitness({ fitness: "weak" }), "weak");
  assert.equal(weakerScoredFitness("strong", "adequate"), "adequate");
  assert.equal(weakerScoredFitness("adequate", "weak"), "weak");
});

test("stored technology_fit wins over the default; missing scored links stay unassessed", () => {
  const finance = obj("fin", "business_domain", "Finance");
  const cap = obj("ap", "capability", "Accounting", {
    owner: "CFO",
    properties: { domain_id: "fin", business_criticality: "high", investment_posture: "migrate", technology_fit: 5 },
  });
  const act = obj("gl", "capability", "Manage general ledger", { properties: { domain_id: "fin", parent_id: "ap" } });
  const app = obj("erp", "application", "ERP", { properties: { annual_cost: 1000 } });
  const objects = [finance, cap, act, app];
  const edges = [edge("gl", "erp", { fitness: "weak" })];

  const stored = assessCapability(cap, objects, edges);
  assert.equal(stored.technologyFit, 5);
  assert.equal(stored.technologyFitSource, "stored");
  assert.equal(stored.weakestScoredFitness, "weak");
  assert.equal(stored.assessed, true);
  assert.equal(stored.exposed, false); // fit 5 is not poor

  const unset = assessCapability(
    obj("ap", "capability", "Accounting", { owner: "CFO", properties: { domain_id: "fin", business_criticality: "high", investment_posture: "migrate" } }),
    objects,
    edges,
  );
  assert.equal(unset.technologyFit, 2);
  assert.equal(unset.technologyFitSource, "default");
  assert.equal(unset.exposed, true);

  const noScore = assessCapability(
    obj("ap", "capability", "Accounting", { owner: "CFO", properties: { domain_id: "fin", business_criticality: "high", investment_posture: "migrate" } }),
    objects,
    [edge("gl", "erp")],
  );
  assert.equal(noScore.technologyFit, null);
  assert.equal(noScore.technologyFitSource, null);
  assert.equal(noScore.assessed, false);
  assert.equal(noScore.exposed, false);
});

test("retire savings counts each app once even when marked Retire on two capabilities", () => {
  const a = obj("a", "application", "Scheduler", { properties: { annual_cost: 180_000 } });
  const b = obj("b", "application", "Ledger", { properties: { annual_cost: 200_000 } });
  const objects = [
    obj("fin", "business_domain", "Finance"),
    obj("ap", "capability", "Accounting", { properties: { domain_id: "fin" } }),
    obj("cm", "capability", "Construction", { properties: { domain_id: "fin" } }),
    a,
    b,
  ];
  const edges = [
    edge("ap", "a", { disposition: "retire" }),
    edge("cm", "a", { disposition: "retire" }),
    edge("ap", "b", { disposition: "consolidate" }),
  ];
  const all = retireSavings(objects, edges, [row("a", 180_000), row("b", 200_000)]);
  assert.equal(all.amount, 180_000);
  assert.deepEqual(all.appIds, ["a"]);

  const onlyAp = retireSavings(objects, edges, [row("a", 180_000)], new Set(["ap"]));
  assert.equal(onlyAp.amount, 180_000);
});

test("executive KPIs stay honest when fields are empty, and exposure uses High/Critical + fit <= 2", () => {
  const finance = obj("fin", "business_domain", "Finance", { properties: { order_index: 1 } });
  const cap = obj("ap", "capability", "Accounting", { properties: { domain_id: "fin" } });
  const app = obj("erp", "application", "ERP", { properties: { annual_cost: 50_000 } });
  const objects = [finance, cap, app];
  const edges = [edge("ap", "erp")];
  const rows = [row("erp", 50_000)];
  const tree = buildCapabilityTree(objects, edges, rows);
  const empty = executiveKpis(objects, edges, rows, tree);
  assert.equal(empty.runCost.empty, false);
  assert.equal(empty.runCost.value, 50_000);
  assert.equal(empty.exposure.empty, true);
  assert.equal(empty.exposure.label, "—");
  assert.equal(empty.savings.empty, true);
  assert.equal(empty.savings.label, "—");
  assert.equal(empty.completeness.assessed, 0);
  assert.equal(empty.completeness.total, 1);

  const assessedCap = obj("ap", "capability", "Accounting", {
    owner: "CFO",
    properties: { domain_id: "fin", business_criticality: "critical", investment_posture: "migrate", technology_fit: 2 },
  });
  const filled = executiveKpis([finance, assessedCap, app], edges, rows, buildCapabilityTree([finance, assessedCap, app], edges, rows));
  assert.equal(filled.completeness.assessed, 1);
  assert.equal(filled.exposure.empty, false);
  assert.equal(filled.exposure.value, 1);
});

test("parsers accept aliases and reject unknown values", () => {
  assert.equal(parseInvestmentPosture("Invest"), "invest");
  assert.equal(parseInvestmentPosture("hold"), null);
  assert.equal(parseBusinessCriticality("tier1"), "critical");
  assert.equal(parseBusinessCriticality("HIGH"), "high");
  assert.equal(parseDisposition("Retire"), "retire");
  assert.equal(parseTechnologyFit("3"), 3);
  assert.equal(parseTechnologyFit(0), null);
  assert.equal(parseTechnologyFit(6), null);
});

test("suggested posture follows retire / fit rules", () => {
  const base = {
    posture: null,
    overrideReason: "",
    businessCriticality: "high" as const,
    technologyFit: 4,
    technologyFitSource: "stored" as const,
    weakestScoredFitness: "strong" as const,
    assessed: true,
    exposed: false,
  };
  assert.equal(suggestInvestmentPosture(base, { coverage: "covered" } as never, ["retire", "retire"])?.posture, "eliminate");
  assert.equal(suggestInvestmentPosture(base, { coverage: "covered" } as never, ["retire", "keep"])?.posture, "migrate");
  assert.equal(suggestInvestmentPosture({ ...base, technologyFit: 2 }, { coverage: "partial" } as never, [])?.posture, "migrate");
  assert.equal(suggestInvestmentPosture(base, { coverage: "covered" } as never, [])?.posture, "invest");
});

test("domain-scoped KPIs use that domain only; All domains stays estate-wide", () => {
  const finance = obj("fin", "business_domain", "Finance", { properties: { order_index: 1 } });
  const sales = obj("sales", "business_domain", "Sales", { properties: { order_index: 2 } });
  const ap = obj("ap", "capability", "Accounting", {
    owner: "CFO",
    properties: { domain_id: "fin", business_criticality: "critical", investment_posture: "migrate", technology_fit: 2 },
  });
  const pay = obj("pay", "capability", "Payroll", {
    properties: { domain_id: "fin" },
  });
  const lead = obj("lead", "capability", "Lead capture", {
    owner: "CSO",
    properties: { domain_id: "sales", business_criticality: "high", investment_posture: "invest", technology_fit: 4 },
  });
  const ledger = obj("ledger", "application", "Legacy GL", { properties: { annual_cost: 90_000 } });
  const crm = obj("crm", "application", "CRM", { properties: { annual_cost: 40_000 } });
  const erp = obj("erp", "application", "ERP", { properties: { annual_cost: 50_000 } });
  const objects = [finance, sales, ap, pay, lead, ledger, crm, erp];
  const edges: CapEdge[] = [
    { type: "supported_by", from_object_id: "ap", to_object_id: "ledger", attributes: { disposition: "retire" } },
    { type: "supported_by", from_object_id: "ap", to_object_id: "erp", attributes: { disposition: "keep" } },
    { type: "supported_by", from_object_id: "lead", to_object_id: "crm", attributes: { disposition: "retire" } },
    // Same ledger also marked Retire under Sales — estate-wide still counts the app once
    { type: "supported_by", from_object_id: "lead", to_object_id: "ledger", attributes: { disposition: "retire" } },
  ];
  const rows = [row("ledger", 90_000), row("crm", 40_000), row("erp", 50_000)];
  const tree = buildCapabilityTree(objects, edges, rows);

  const all = executiveKpis(objects, edges, rows, tree);
  assert.equal(all.scopeLabel, null);
  assert.equal(all.runCost.value, 90_000 + 40_000 + 50_000);
  assert.equal(all.savings.value, 90_000 + 40_000);
  assert.equal(all.savings.appCount, 2);
  assert.equal(all.exposure.value, 1);
  assert.equal(all.completeness.assessed, 2);
  assert.equal(all.completeness.total, 3);

  const fin = executiveKpis(objects, edges, rows, tree, { domainId: "fin", domainName: "Finance" });
  assert.equal(fin.scopeLabel, "in Finance");
  assert.equal(fin.runCost.value, 90_000 + 50_000);
  assert.equal(fin.savings.value, 90_000);
  assert.equal(fin.savings.appCount, 1);
  assert.equal(fin.exposure.value, 1);
  assert.equal(fin.completeness.assessed, 1);
  assert.equal(fin.completeness.total, 2);

  const salesKpi = executiveKpis(objects, edges, rows, tree, { domainId: "sales", domainName: "Sales" });
  assert.equal(salesKpi.scopeLabel, "in Sales");
  assert.equal(salesKpi.runCost.value, 40_000 + 90_000);
  // Retire-only, each app once within Sales (CRM + ledger)
  assert.equal(salesKpi.savings.value, 40_000 + 90_000);
  assert.equal(salesKpi.savings.appCount, 2);
  assert.equal(salesKpi.exposure.value, 0);
  assert.equal(salesKpi.completeness.assessed, 1);
  assert.equal(salesKpi.completeness.total, 1);
});

test("l2Capabilities excludes activities, so the map header can count 16 not 16+activities", () => {
  const objects = [
    obj("fin", "business_domain", "Finance"),
    obj("ap", "capability", "Accounting", { properties: { domain_id: "fin" } }),
    obj("pay", "capability", "Payroll", { properties: { domain_id: "fin" } }),
    obj("gl", "capability", "Manage general ledger", { properties: { domain_id: "fin", parent_id: "ap" } }),
    obj("tx", "capability", "Post transactions", { properties: { domain_id: "fin", parent_id: "ap" } }),
  ];
  assert.deepEqual(l2Capabilities(objects).map((item) => item.id), ["ap", "pay"]);
});

test("domain identity colour is stable by estate order, wraps the palette, and survives a drilled-in list of one", () => {
  const ids = Array.from({ length: DOMAIN_IDENTITY_PALETTE.length + 3 }, (_, i) => `d${i}`);
  assert.equal(domainIdentityColor("d0", ids), DOMAIN_IDENTITY_PALETTE[0]);
  assert.equal(domainIdentityColor("d1", ids), DOMAIN_IDENTITY_PALETTE[1]);
  assert.equal(domainIdentityColor(`d${DOMAIN_IDENTITY_PALETTE.length}`, ids), DOMAIN_IDENTITY_PALETTE[0]);
  // Colour is the estate-wide index, so a drilled-in view must pass the full id list (not [thisDomain]).
  assert.equal(domainIdentityColor("d3", ids), DOMAIN_IDENTITY_PALETTE[3]);
  assert.notEqual(domainIdentityColor("d3", ids), domainIdentityColor("d3", ["d3"]));
  const treeIds = orderedDomainIdsFromTree([
    { id: "no-domain", name: "No domain" } as never,
    { id: "fin", name: "Finance" } as never,
    { id: "sales", name: "Sales" } as never,
  ]);
  assert.deepEqual(treeIds, ["fin", "sales"]);
});

test("domain lens roll-up reports posture mix, spend share, risk mix, coverage %, assessed x/y, and — spend", () => {
  const finance = obj("fin", "business_domain", "Finance", { properties: { order_index: 1 } });
  const sales = obj("sales", "business_domain", "Sales", { properties: { order_index: 2 } });
  const ap = obj("ap", "capability", "Accounting", {
    owner: "CFO",
    properties: { domain_id: "fin", business_criticality: "critical", investment_posture: "migrate", technology_fit: 2 },
  });
  const pay = obj("pay", "capability", "Payroll", { properties: { domain_id: "fin" } });
  const lead = obj("lead", "capability", "Lead capture", {
    owner: "CSO",
    properties: { domain_id: "sales", business_criticality: "high", investment_posture: "invest", technology_fit: 4 },
  });
  const ledger = obj("ledger", "application", "Legacy GL", { properties: { annual_cost: 90_000 } });
  const crm = obj("crm", "application", "CRM", { properties: { annual_cost: 40_000 } });
  const objects = [finance, sales, ap, pay, lead, ledger, crm];
  const edges: CapEdge[] = [
    edge("ap", "ledger"),
    edge("lead", "crm"),
  ];
  const rows = [row("ledger", 90_000), row("crm", 40_000)];
  const tree = buildCapabilityTree(objects, edges, rows);
  const fin = tree.find((node) => node.id === "fin")!;
  const salesNode = tree.find((node) => node.id === "sales")!;
  const estateSpend = tree.reduce((sum, node) => sum + node.cost, 0);

  const posture = domainLensRollup(fin, objects, edges, "posture", estateSpend);
  assert.equal(posture.assessed, 1);
  assert.equal(posture.total, 2);
  assert.equal(posture.spend, 90_000);
  assert.equal(posture.spendLabel, "$90k");
  assert.ok(posture.segments.some((segment) => segment.key === "migrate" && Math.abs(segment.fraction - 0.5) < 1e-9));
  assert.ok(posture.segments.some((segment) => segment.key === "none" && Math.abs(segment.fraction - 0.5) < 1e-9));

  const spend = domainLensRollup(fin, objects, edges, "spend", estateSpend);
  assert.equal(spend.segments.length, 1);
  assert.equal(spend.segments[0]!.key, "spend");
  assert.ok(Math.abs(spend.segments[0]!.fraction - 90_000 / estateSpend) < 1e-9);

  const risk = domainLensRollup(fin, objects, edges, "risk", estateSpend);
  assert.ok(risk.segments.some((segment) => segment.key === "critical"));
  assert.ok(risk.segments.some((segment) => segment.key === "none"));

  const coverage = domainLensRollup(salesNode, objects, edges, "coverage", estateSpend);
  assert.equal(coverage.coveragePercent, 100);
  assert.ok(coverage.segments.some((segment) => segment.key === "covered" && segment.fraction === 1));

  const emptyPayDomain = domainLensRollup(
    { ...fin, cost: 0, children: fin.children.filter((child) => child.id === "pay") },
    objects,
    edges,
    "spend",
    estateSpend,
  );
  assert.equal(emptyPayDomain.spendLabel, "—");
  assert.deepEqual(emptyPayDomain.segments, []);
  assert.equal(emptyPayDomain.assessed, 0);
  assert.equal(emptyPayDomain.total, 1);
});

test("unassessed tiles are muted for posture, spend, and risk lenses, not coverage", () => {
  assert.equal(isExecutiveTileMuted("posture", 0, null, null), true);
  assert.equal(isExecutiveTileMuted("posture", 10, "invest", "high"), false);
  assert.equal(isExecutiveTileMuted("spend", 0, "invest", "high"), true);
  assert.equal(isExecutiveTileMuted("spend", 10, null, null), false);
  assert.equal(isExecutiveTileMuted("risk", 10, "invest", null), true);
  assert.equal(isExecutiveTileMuted("coverage", 0, null, null), false);
});

