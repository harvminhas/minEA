import assert from "node:assert/strict";
import { test } from "node:test";
import { planSupplyAdd, planSupplyRemove, suppliedItems } from "./vendor-supplies.ts";

const vendor = { id: "ms", name: "Microsoft", type: "external_party" };
const rels = [
  { id: "r1", type: "supplied_by", from_object_id: "teams", to_object_id: "ms" },
  { id: "r2", type: "supplied_by", from_object_id: "crm", to_object_id: "oracle" },
];

test("a vendor lists linked items and items whose vendor text names it", () => {
  const objects = [
    { id: "teams", name: "Teams", type: "application", properties: {} },
    { id: "excel", name: "Excel", type: "application", properties: { vendor: "microsoft" } },
    { id: "crm", name: "CRM", type: "application", properties: { vendor: "Oracle" } },
  ];
  assert.deepEqual(
    suppliedItems(vendor, objects, rels).map((item) => [item.name, item.linked]),
    [["Excel", false], ["Teams", true]]
  );
});

test("adding from the vendor saves item supplied_by vendor and replaces the old vendor", () => {
  const plan = planSupplyAdd(vendor, { id: "crm", type: "application" }, rels);
  assert.deepEqual(plan.addRel, [
    { type: "supplied_by", from_object_id: "crm", from_type: "application", to_object_id: "ms", to_type: "external_party" },
  ]);
  assert.deepEqual(plan.removeRelIds, ["r2"]);
  assert.equal(plan.vendorText, "Microsoft");
  assert.deepEqual(planSupplyAdd(vendor, { id: "teams", type: "application" }, rels).addRel, []);
});

test("removing from the vendor drops the link and clears matching vendor text", () => {
  assert.deepEqual(planSupplyRemove(vendor, { id: "teams", properties: { vendor: "Microsoft" } }, rels), {
    addRel: [],
    removeRelIds: ["r1"],
    vendorText: null,
  });
  assert.equal(planSupplyRemove(vendor, { id: "teams", properties: { vendor: "Other" } }, rels).vendorText, undefined);
});
