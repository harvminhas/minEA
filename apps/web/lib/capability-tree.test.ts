import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCapabilityTree, flatten, heatClass, heatMeta, isActivity, tilesInDomain } from "./capability-tree";
import type { CatalogRow } from "./model-catalog";

const o = (id: string, type: string, name: string, properties: Record<string, unknown> = {}) => ({ id, type, name, properties });
const row = (id: string, name: string, annual: number, criticality?: string): CatalogRow =>
  ({ id, name, type: "application", annualCostNumber: annual, object: o(id, "application", name, { annual_cost: annual, ...(criticality ? { criticality } : {}) }), effective: o(id, "application", name, { annual_cost: annual, ...(criticality ? { criticality } : {}) }) }) as CatalogRow;

test("parent_id equal to domain_id is still L2", () => {
  assert.equal(isActivity({ domain_id: "d", parent_id: "d" }), false);
  assert.equal(isActivity({ domain_id: "d", parent_id: "c" }), true);
  assert.equal(isActivity({}), false);
});

test("an app linked at L3 counts once in each ancestor, never twice at L2 or L1", () => {
  const d = o("d", "business_domain", "Financial Management");
  const ap = o("ap", "capability", "Accounts Payable", { domain_id: "d" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "d", parent_id: "ap" });
  const pay = o("pay", "capability", "Vendor payments", { domain_id: "d", parent_id: "ap" });
  const qb = o("qb", "application", "QuickBooks", { annual_cost: 42000 });
  const epic = o("epic", "application", "Epic", { annual_cost: 200000, criticality: "critical" });
  // QuickBooks supports both activities; must count once in AP and Finance.
  const edges = [
    { type: "supported_by", from_object_id: "inv", to_object_id: "qb" },
    { type: "supported_by", from_object_id: "pay", to_object_id: "qb" },
    { type: "supported_by", from_object_id: "inv", to_object_id: "epic" },
  ];
  const rows = [row("qb", "QuickBooks", 42000), row("epic", "Epic", 200000, "critical")];
  const tree = buildCapabilityTree([d, ap, inv, pay, qb, epic], edges, rows);
  assert.equal(tree.length, 1);
  const finance = tree[0]!;
  const payable = finance.children[0]!;
  assert.deepEqual(new Set(payable.uniqueAppIds), new Set(["qb", "epic"]));
  assert.equal(payable.cost, 242000);
  assert.equal(finance.cost, 242000);
  assert.equal(finance.uniqueAppIds.length, 2);
  assert.equal(payable.coverage, "covered");
  assert.equal(payable.risk, "high");
  assert.equal(flatten(tree, "l3").length, 2);
  assert.equal(heatClass(payable, "coverage"), "c-good");
});

test("a parent with no covered children is a gap; mixed children are partial", () => {
  const d = o("d", "business_domain", "Finance");
  const ap = o("ap", "capability", "AP", { domain_id: "d" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "d", parent_id: "ap" });
  const pay = o("pay", "capability", "Vendor payments", { domain_id: "d", parent_id: "ap" });
  const qb = o("qb", "application", "QuickBooks");
  const tree = buildCapabilityTree([d, ap, inv, pay, qb], [{ type: "supported_by", from_object_id: "pay", to_object_id: "qb" }]);
  assert.equal(tree[0]!.children[0]!.coverage, "partial");
  assert.equal(tree[0]!.children[0]!.children.find((c) => c.id === "inv")!.coverage, "gap");
});

test("a capability with an app but no covered activities is partial, not a gap", () => {
  const d = o("d", "business_domain", "Finance");
  const ap = o("ap", "capability", "AP", { domain_id: "d" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "d", parent_id: "ap" });
  const pay = o("pay", "capability", "Vendor payments", { domain_id: "d", parent_id: "ap" });
  const sage = o("sage", "application", "Sage");
  const tree = buildCapabilityTree([d, ap, inv, pay, sage], [{ type: "supported_by", from_object_id: "ap", to_object_id: "sage" }]);
  const node = tree[0]!.children[0]!;
  assert.equal(node.uniqueAppIds.length, 1);
  assert.equal(node.coveredLeaves, 0);
  assert.equal(node.coverage, "partial");
  assert.equal(heatClass(node, "coverage"), "c-fair");
  assert.equal(heatMeta(node, "coverage"), "0 of 2 activities covered");
});

function financeFixture() {
  const objects = [
    o("fin", "business_domain", "Finance"),
    o("ap", "capability", "Accounts Payable", { domain_id: "fin" }),
    o("inv", "capability", "Invoice capture", { domain_id: "fin", parent_id: "ap" }),
    o("pay", "capability", "Vendor payments", { domain_id: "fin", parent_id: "ap" }),
    o("plan", "capability", "Financial Planning", { domain_id: "fin" }),
    o("bud", "capability", "Budgets", { domain_id: "fin", parent_id: "plan" }),
    o("fc", "capability", "Forecasts", { domain_id: "fin", parent_id: "plan" }),
    o("tre", "capability", "Treasury", { domain_id: "fin" }),
    o("sage", "application", "Sage", { annual_cost: 18000 }),
    o("qb", "application", "QuickBooks", { annual_cost: 42000 }),
    o("epic", "application", "Epic", { annual_cost: 200000 }),
    o("hyp", "application", "Hyperion", { annual_cost: 80000 }),
    o("bank", "application", "Bank Portal", { annual_cost: 22000 }),
  ];
  const edges = [
    { type: "supported_by", from_object_id: "ap", to_object_id: "sage", attributes: { fitness: "strong" } },
    { type: "supported_by", from_object_id: "inv", to_object_id: "qb", attributes: { fitness: "adequate" } },
    { type: "supported_by", from_object_id: "inv", to_object_id: "epic", attributes: { fitness: "weak" } },
    { type: "supported_by", from_object_id: "pay", to_object_id: "qb", attributes: { fitness: "strong" } },
    { type: "supported_by", from_object_id: "plan", to_object_id: "hyp", attributes: { fitness: "strong" } },
    { type: "supported_by", from_object_id: "bud", to_object_id: "hyp", attributes: { fitness: "strong" } },
    { type: "supported_by", from_object_id: "tre", to_object_id: "bank", attributes: { fitness: "adequate" } },
  ];
  const tree = buildCapabilityTree(objects, edges);
  const finance = tree[0]!;
  const byId = (id: string) => {
    if (finance.id === id) return finance;
    for (const cap of finance.children) {
      if (cap.id === id) return cap;
      const act = cap.children.find((child) => child.id === id);
      if (act) return act;
    }
    throw new Error(`missing ${id}`);
  };
  return { finance, byId };
}

test("fitness rolls up as the weakest scored link; gaps are not scored as weak", () => {
  const { finance, byId } = financeFixture();
  const inv = byId("inv");
  const pay = byId("pay");
  const ap = byId("ap");
  const plan = byId("plan");
  const fc = byId("fc");
  const bud = byId("bud");
  const tre = byId("tre");

  assert.equal(inv.fitness, "weak");
  assert.equal(inv.fitnessHint, "Epic on Invoice capture");
  assert.equal(pay.fitness, "strong");
  assert.equal(ap.fitness, "weak");
  assert.equal(ap.fitnessHint, "Epic on Invoice capture");
  assert.equal(finance.fitness, "weak");
  assert.equal(finance.fitnessHint, "Epic on Invoice capture");
  assert.equal(fc.fitness, "none");
  assert.equal(bud.fitness, "strong");
  assert.equal(plan.fitness, "strong");
  assert.equal(tre.fitness, "adequate");
  assert.equal(heatClass(ap, "fitness"), "c-gap");
  assert.equal(heatMeta(ap, "fitness"), "Weakest: Epic on Invoice capture");
  assert.equal(heatClass(plan, "fitness"), "c-good");
  assert.equal(heatMeta(plan, "fitness"), "Strong");
  assert.equal(heatClass(tre, "fitness"), "c-fair");
  assert.equal(heatMeta(tre, "fitness"), "Adequate");
  assert.equal(heatClass(fc, "fitness"), "a-0");
  assert.equal(heatMeta(fc, "fitness"), "No app");
});

test("missing fitness on a link counts as adequate; explicit none is not scored", () => {
  const d = o("d", "business_domain", "Finance");
  const cap = o("cap", "capability", "Treasury", { domain_id: "d" });
  const a = o("a", "application", "Bank Portal");
  const b = o("b", "application", "Excel");
  const missing = buildCapabilityTree(
    [d, cap, a],
    [{ type: "supported_by", from_object_id: "cap", to_object_id: "a" }]
  );
  assert.equal(missing[0]!.children[0]!.fitness, "adequate");

  const noneOnly = buildCapabilityTree(
    [d, cap, a],
    [{ type: "supported_by", from_object_id: "cap", to_object_id: "a", attributes: { fitness: "none" } }]
  );
  assert.equal(noneOnly[0]!.children[0]!.fitness, "none");

  const mixed = buildCapabilityTree(
    [d, cap, a, b],
    [
      { type: "supported_by", from_object_id: "cap", to_object_id: "a", attributes: { fitness: "none" } },
      { type: "supported_by", from_object_id: "cap", to_object_id: "b", attributes: { fitness: "strong" } },
    ]
  );
  assert.equal(mixed[0]!.children[0]!.fitness, "strong");
});

test("redundancy flags an activity with two direct apps and parents inherit it", () => {
  const { finance, byId } = financeFixture();
  const inv = byId("inv");
  const pay = byId("pay");
  const ap = byId("ap");
  const plan = byId("plan");
  const bud = byId("bud");
  const tre = byId("tre");

  assert.equal(inv.redundancy, "two");
  assert.deepEqual(inv.redundancyApps, ["QuickBooks", "Epic"]);
  assert.equal(inv.redundancyPlace, "Invoice capture");
  assert.equal(inv.redundancyHint, "2 apps on Invoice capture");
  assert.equal(pay.redundancy, "none");
  assert.equal(ap.redundancy, "two");
  assert.equal(ap.redundancyHint, "2 apps on Invoice capture");
  assert.equal(ap.redundancyPlace, "Invoice capture");
  assert.deepEqual(ap.redundancyApps, ["QuickBooks", "Epic"]);
  assert.equal(finance.redundancy, "two");
  assert.equal(plan.redundancy, "none");
  assert.equal(bud.redundancy, "none");
  assert.equal(tre.redundancy, "none");
  assert.equal(heatClass(ap, "redundancy"), "c-fair");
  assert.equal(heatMeta(ap, "redundancy"), "2 apps on Invoice capture");
  assert.equal(heatClass(plan, "redundancy"), "c-good");
  assert.equal(heatMeta(plan, "redundancy"), "No overlap");
  assert.equal(heatClass(byId("fc"), "redundancy"), "a-0");
  assert.equal(heatMeta(byId("fc"), "redundancy"), "No app");
});

test("the same app at two levels counts once and two single-app activities are not overlap", () => {
  const { byId } = financeFixture();
  assert.equal(byId("plan").uniqueAppIds.length, 1);
  assert.equal(byId("plan").redundancy, "none");

  const d = o("d", "business_domain", "Finance");
  const ap = o("ap", "capability", "AP", { domain_id: "d" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "d", parent_id: "ap" });
  const pay = o("pay", "capability", "Vendor payments", { domain_id: "d", parent_id: "ap" });
  const qb = o("qb", "application", "QuickBooks");
  const sage = o("sage", "application", "Sage");
  const tree = buildCapabilityTree(
    [d, ap, inv, pay, qb, sage],
    [
      { type: "supported_by", from_object_id: "inv", to_object_id: "qb", attributes: { fitness: "strong" } },
      { type: "supported_by", from_object_id: "pay", to_object_id: "sage", attributes: { fitness: "strong" } },
    ]
  );
  const node = tree[0]!.children[0]!;
  assert.equal(node.redundancy, "none");
  assert.equal(node.children[0]!.redundancy, "none");
  assert.equal(node.children[1]!.redundancy, "none");
});

test("a childless capability with three direct apps is flagged as many", () => {
  const d = o("d", "business_domain", "Finance");
  const tre = o("tre", "capability", "Treasury", { domain_id: "d" });
  const a = o("a", "application", "Bank Portal");
  const b = o("b", "application", "Kyriba");
  const c = o("c", "application", "Excel");
  const tree = buildCapabilityTree(
    [d, tre, a, b, c],
    [
      { type: "supported_by", from_object_id: "tre", to_object_id: "a", attributes: { fitness: "adequate" } },
      { type: "supported_by", from_object_id: "tre", to_object_id: "b", attributes: { fitness: "strong" } },
      { type: "supported_by", from_object_id: "tre", to_object_id: "c", attributes: { fitness: "adequate" } },
    ]
  );
  const node = tree[0]!.children[0]!;
  assert.equal(node.redundancy, "many");
  assert.equal(heatClass(node, "redundancy"), "c-gap");
  assert.equal(heatMeta(node, "redundancy"), "3 apps on Treasury");
  assert.equal(tree[0]!.redundancy, "many");
});

const fixture = JSON.parse(
  readFileSync(new URL("../../../packages/types/src/fixtures/capability-tree.fixture.json", import.meta.url), "utf8")
) as { cases: { id: string; objects: Parameters<typeof buildCapabilityTree>[0]; edges: Parameters<typeof buildCapabilityTree>[1]; expected: ReturnType<typeof buildCapabilityTree> }[] };

test("the shared fixture matches buildCapabilityTree (Python parity)", () => {
  for (const item of fixture.cases) {
    assert.deepEqual(buildCapabilityTree(item.objects, item.edges), item.expected, item.id);
  }
});

test("tilesInDomain keeps a domain and the capabilities or activities under it", () => {
  const finance = o("fin", "business_domain", "Finance");
  const people = o("peo", "business_domain", "People");
  const ap = o("ap", "capability", "Accounts Payable", { domain_id: "fin" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "fin", parent_id: "ap" });
  const hr = o("hr", "capability", "HR", { domain_id: "peo" });
  const tree = buildCapabilityTree([finance, people, ap, inv, hr], [], []);
  const l1 = tilesInDomain(flatten(tree, "l1"), "fin");
  assert.deepEqual(l1.map((n) => n.id), ["fin"]);
  const l2 = tilesInDomain(flatten(tree, "l2"), "fin");
  assert.deepEqual(l2.map((n) => n.id), ["ap"]);
  const l3 = tilesInDomain(flatten(tree, "l3"), "fin");
  assert.deepEqual(l3.map((n) => n.id), ["inv"]);
});
