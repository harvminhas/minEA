import assert from "node:assert/strict";
import { test } from "node:test";
import type { CapabilityMap } from "@minea/types";
import {
  filterMapTargets,
  flattenMapCapabilities,
  flattenMapTargets,
  groupMapTargets,
  planSystemCapabilitySync,
} from "./system-capability-utils";

const map = {
  domains: [
    {
      id: "fin",
      name: "Finance",
      capabilities: [
        {
          id: "ap",
          name: "Accounts Payable",
          children: [
            { id: "inv", name: "Invoice capture" },
            { id: "pay", name: "Vendor payments" },
          ],
        },
        { id: "plan", name: "Financial Planning", children: [{ id: "bud", name: "Budgets" }] },
      ],
    },
  ],
} as CapabilityMap;

test("flattenMapCapabilities stays L2-only for products and the domain matrix", () => {
  assert.deepEqual(
    flattenMapCapabilities(map).map((row) => row.capability.id),
    ["ap", "plan"]
  );
});

test("flattenMapTargets includes capabilities and nested activities", () => {
  const rows = flattenMapTargets(map);
  assert.deepEqual(
    rows.map((row) => [row.id, row.level, row.parentId]),
    [
      ["ap", "capability", null],
      ["inv", "activity", "ap"],
      ["pay", "activity", "ap"],
      ["plan", "capability", null],
      ["bud", "activity", "plan"],
    ]
  );
});

test("groupMapTargets nests activities under their parent capability", () => {
  const grouped = groupMapTargets(flattenMapTargets(map));
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]!.domainName, "Finance");
  assert.deepEqual(
    grouped[0]!.capabilities.map((item) => [item.cap.id, item.activities.map((a) => a.id)]),
    [
      ["ap", ["inv", "pay"]],
      ["plan", ["bud"]],
    ]
  );
});

test("filterMapTargets keeps a parent when only an activity matches", () => {
  const filtered = filterMapTargets(flattenMapTargets(map), "invoice");
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["ap", "inv"]
  );
});

test("sync plan keeps an activity link and does not rewrite it to the parent", () => {
  const known = new Set(["ap", "inv", "pay"]);
  const existing = [
    { id: "r1", type: "supported_by", from_type: "capability", to_type: "application", from_object_id: "inv" },
  ];
  const plan = planSystemCapabilitySync(existing, ["inv"], known);
  assert.deepEqual(plan, { keepRelIds: ["r1"], deleteRelIds: [], createIds: [] });
});

test("sync plan can keep a capability and an activity link independently", () => {
  const known = new Set(["ap", "inv", "pay"]);
  const existing = [
    { id: "r-sage", type: "supported_by", from_type: "capability", to_type: "application", from_object_id: "ap" },
    { id: "r-qb", type: "supported_by", from_type: "capability", to_type: "application", from_object_id: "inv" },
  ];
  const plan = planSystemCapabilitySync(existing, ["ap", "inv"], known);
  assert.deepEqual(plan.keepRelIds.sort(), ["r-qb", "r-sage"]);
  assert.deepEqual(plan.deleteRelIds, []);
  assert.deepEqual(plan.createIds, []);
});

test("sync plan deletes an unchecked activity and creates a newly checked capability without touching the other", () => {
  const known = new Set(["ap", "inv", "pay"]);
  const existing = [
    { id: "r-inv", type: "supported_by", from_type: "capability", to_type: "application", from_object_id: "inv" },
  ];
  const plan = planSystemCapabilitySync(existing, ["ap"], known);
  assert.deepEqual(plan, { keepRelIds: [], deleteRelIds: ["r-inv"], createIds: ["ap"] });
});
