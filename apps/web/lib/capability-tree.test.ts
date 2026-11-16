import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCapabilityTree, flatten, heatClass, isActivity } from "./capability-tree";
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
