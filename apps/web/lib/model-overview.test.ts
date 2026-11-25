import assert from "node:assert/strict";
import { test } from "node:test";
import type { MinEAObject, Relationship } from "@minea/types";
import {
  endingCount,
  endingSentence,
  overviewActions,
  overviewCapabilityEmpty,
  overviewGaps,
  overviewRisks,
  overviewCostByDomain,
  unownedSentence,
} from "./model-overview.ts";
import type { CatalogRow } from "./model-catalog.ts";

function obj(id: string, type: string, name: string, extra: Partial<MinEAObject> = {}): MinEAObject {
  return { id, type, name, properties: {}, ...extra } as MinEAObject;
}

test("a workspace with no capabilities is empty for Overview", () => {
  assert.equal(overviewCapabilityEmpty([]), true);
  assert.equal(overviewCapabilityEmpty([obj("a", "application", "CRM")]), true);
  assert.equal(overviewCapabilityEmpty([obj("c", "capability", "Lead capture", { properties: { order_index: 1 } })]), false);
});

test("gaps list unmapped capabilities first, then unowned ones", () => {
  const objects = [
    obj("d", "business_domain", "Sales"),
    obj("open", "capability", "Handover", { properties: { domain_id: "d" } }),
    obj("owned", "capability", "Billing", { properties: { domain_id: "d" }, owner: "Finance" } as Partial<MinEAObject>),
    obj("lone", "capability", "Case management", { properties: { domain_id: "d" } }),
    obj("crm", "application", "CRM"),
  ];
  const rels = [
    { id: "r1", type: "supported_by", from_object_id: "owned", to_object_id: "crm" },
    { id: "r2", type: "supported_by", from_object_id: "lone", to_object_id: "crm" },
  ] as Relationship[];
  const gaps = overviewGaps(objects, rels, (id) => `/cap/${id}`);
  assert.deepEqual(gaps.map((gap) => gap.message), [
    "Handover has no system mapped",
    "Case management has no owner",
  ]);
  assert.equal(gaps[0]?.href, "/cap/open");
});

test("risk sentences and hidden-when-zero helpers", () => {
  const none = { shadow: 0, unownedCaps: 0, unownedApps: 0, renewals: 0, endOfLife: 0, aging: 0 };
  assert.equal(endingCount(none), 0);
  assert.equal(unownedSentence({ ...none, unownedCaps: 7, unownedApps: 4 }), "7 capabilities and 4 applications have no owner.");
  assert.equal(unownedSentence({ ...none, unownedCaps: 1 }), "1 capability has no owner.");
  assert.equal(endingSentence({ ...none, renewals: 3, endOfLife: 1 }), "3 contracts due in 90 days, 1 application at end of life.");
});

test("next actions take the first unmapped, first unowned, then renewals", () => {
  const actions = overviewActions(
    [
      { id: "g1", severity: "error", message: "Handover has no system mapped", href: "/h" },
      { id: "g2", severity: "warn", message: "Case management has no owner", href: "/c" },
    ],
    { shadow: 2, unownedCaps: 1, unownedApps: 0, renewals: 3, endOfLife: 0, aging: 0 },
    { renewals: "/road", applications: "/apps" },
  );
  assert.deepEqual(actions.map((item) => item.label), [
    "Map a system to Handover",
    "Assign an owner to Case management",
    "Review 3 contracts due in the next 90 days",
  ]);
});

test("shadow IT is counted from governance_status", () => {
  const objects = [
    obj("a", "application", "Shadow CRM", { properties: { governance_status: "shadow" } }),
    obj("b", "application", "Official", { properties: { governance_status: "sanctioned" } }),
  ];
  const risks = overviewRisks(objects, []);
  assert.equal(risks.shadow, 1);
});

function costRow(id: string, name: string, annual: number): CatalogRow {
  const object = { id, type: "application", name, properties: { annual_cost: annual } };
  return { id, name, type: "application", kind: "application", annualCostNumber: annual, object, effective: object } as CatalogRow;
}

test("estate cost counts an unmapped app, and an app in two domains only once", () => {
  const empty = overviewCostByDomain(
    [obj("billing", "application", "Billing"), obj("crm", "application", "CRM")],
    [],
    [costRow("billing", "Billing", 120000), costRow("crm", "CRM", 80000)],
  );
  assert.equal(empty.total, 200000);
  assert.equal(empty.appsWithCost, 2);
  assert.equal(empty.totalLabel, "$200,000");

  const domain = obj("d", "business_domain", "Sales");
  const capA = obj("ca", "capability", "Lead", { properties: { domain_id: "d" } });
  const capB = obj("cb", "capability", "Handover", { properties: { domain_id: "d" } });
  const app = obj("crm", "application", "CRM");
  const shared = overviewCostByDomain(
    [domain, capA, capB, app],
    [
      { id: "r1", type: "supported_by", from_object_id: "ca", to_object_id: "crm" },
      { id: "r2", type: "supported_by", from_object_id: "cb", to_object_id: "crm" },
    ] as Relationship[],
    [costRow("crm", "CRM", 80000)],
  );
  assert.equal(shared.total, 80000);
  assert.equal(shared.appsWithCost, 1);
  assert.equal(shared.domains.reduce((sum, d) => sum + d.cost, 0), 80000);
});
