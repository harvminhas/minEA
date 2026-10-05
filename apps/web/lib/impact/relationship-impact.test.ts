import assert from "node:assert/strict";
import { test } from "node:test";
import { impactOf, relationshipImpactRules, type ImpactEdge, type ImpactNode } from "./relationship-impact.ts";

const salesforce: ImpactNode[] = [
  { id: "sf", name: "SalesForce CRM" },
  { id: "cs", name: "Customer Service" },
  { id: "mkt", name: "Marketing" },
  { id: "sm", name: "Sales Module" },
  { id: "m360", name: "My 360" },
  { id: "mc", name: "Marketing Campaigns" },
  { id: "next", name: "New CRM" },
];

const salesforceEdges: ImpactEdge[] = [
  { type: "depends_on", fromId: "cs", toId: "sf" },
  { type: "part_of", fromId: "mkt", toId: "sf" },
  { type: "part_of", fromId: "sm", toId: "sf" },
  { type: "part_of", fromId: "m360", toId: "sf" },
  { type: "supported_by", fromId: "mc", toId: "mkt" },
  { type: "replaces", fromId: "next", toId: "sf" },
];

test("SalesForce CRM impact", () => {
  const hits = impactOf(salesforce, salesforceEdges, "sf");
  const byName = new Map(hits.map((hit) => [hit.name, hit]));
  for (const name of ["Customer Service", "Marketing", "Sales Module", "My 360"]) {
    assert.equal(byName.get(name)?.severity, "direct");
    assert.equal(byName.get(name)?.indirect, false);
  }
  assert.equal(byName.get("Marketing")?.path[0]?.label, "Marketing is part of SalesForce CRM");
  assert.equal(byName.get("Marketing Campaigns")?.severity, "loses_support");
  assert.equal(byName.has("New CRM"), false);
  assert.equal(hits.filter((hit) => hit.name === "Customer Service").length, 1);
});

test("a replaces edge never shows up in impact", () => {
  const nodes = [
    { id: "old", name: "Old CRM" },
    { id: "new", name: "New CRM" },
  ];
  const edges = [{ type: "replaces", fromId: "new", toId: "old" }];
  assert.deepEqual(impactOf(nodes, edges, "old"), []);
  assert.deepEqual(impactOf(nodes, edges, "new"), []);
});

test("depends_on chain: C fails, B stops, A stops one step further", () => {
  const nodes = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  const edges = [
    { type: "depends_on", fromId: "a", toId: "b" },
    { type: "depends_on", fromId: "b", toId: "c" },
  ];
  const hits = impactOf(nodes, edges, "c");
  const byName = new Map(hits.map((hit) => [hit.name, hit]));
  assert.equal(byName.get("B")?.severity, "direct");
  assert.equal(byName.get("B")?.indirect, false);
  assert.equal(byName.get("A")?.severity, "direct");
  assert.equal(byName.get("A")?.indirect, true);
  assert.equal(byName.get("A")?.path.map((step) => step.label).join(", then "), "B depends on C, then A depends on B");
  assert.equal(hits.length, 2);
});

test("calls has no impact rule and a data link only slows the reader", () => {
  assert.equal(relationshipImpactRules.calls, undefined);
  const direct = ["depends_on", "runs_on", "built_on", "part_of", "located_at"];
  for (const [type, impactRule] of Object.entries(relationshipImpactRules)) {
    if (impactRule.whenTargetFails === "direct") assert.ok(direct.includes(type), type);
    assert.notEqual(impactRule.whenSourceFails, "direct", type);
  }
  const nodes = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "store", name: "Store" },
  ];
  assert.deepEqual(impactOf(nodes, [{ type: "calls", fromId: "a", toId: "b" }], "b"), []);
  const slow = impactOf(nodes, [{ type: "sends_data_to", fromId: "a", toId: "b" }], "a");
  assert.equal(slow[0]?.name, "B");
  assert.equal(slow[0]?.severity, "degraded");
  const reader = impactOf(nodes, [{ type: "reads", fromId: "a", toId: "store" }], "store");
  assert.equal(reader[0]?.name, "A");
  assert.equal(reader[0]?.severity, "degraded");
});

test("AS400 hosting fixture", () => {
  const nodes = [
    { id: "as400", name: "AS400" },
    { id: "oe", name: "Order Entry" },
    { id: "inv", name: "Inventory" },
    { id: "edi", name: "EDI Gateway" },
    { id: "legacy", name: "Legacy box" },
  ];
  const edges = [
    { type: "runs_on", fromId: "oe", toId: "as400" },
    { type: "runs_on", fromId: "inv", toId: "as400" },
    { type: "runs_on", fromId: "edi", toId: "as400" },
    { type: "replaces", fromId: "legacy", toId: "as400" },
  ];
  const hits = impactOf(nodes, edges, "as400");
  assert.deepEqual(
    hits.map((hit) => hit.name),
    ["EDI Gateway", "Inventory", "Order Entry"]
  );
  assert.ok(hits.every((hit) => hit.severity === "direct" && hit.indirect === false));
  assert.equal(hits[0]?.path[0]?.label, "EDI Gateway runs on AS400");
});

test("a location failure reaches the servers there and the apps on them", () => {
  const nodes = [
    { id: "loc", name: "Fremont plant" },
    { id: "as400", name: "AS400" },
    { id: "oe", name: "Order Entry" },
    { id: "inv", name: "Inventory" },
    { id: "edi", name: "EDI Gateway" },
  ];
  const edges: ImpactEdge[] = [
    { type: "located_at", fromId: "as400", toId: "loc" },
    { type: "runs_on", fromId: "oe", toId: "as400" },
    { type: "runs_on", fromId: "inv", toId: "as400" },
    { type: "runs_on", fromId: "edi", toId: "as400" },
  ];
  const names = impactOf(nodes, edges, "loc").map((hit) => hit.name).sort();
  assert.deepEqual(names, ["AS400", "EDI Gateway", "Inventory", "Order Entry"]);
});

test("a VM on a host fails with the host", () => {
  const nodes = [
    { id: "host", name: "HV01" },
    { id: "vm", name: "FS01" },
    { id: "app", name: "File share" },
  ];
  const edges: ImpactEdge[] = [
    { type: "runs_on", fromId: "vm", toId: "host" },
    { type: "runs_on", fromId: "app", toId: "vm" },
  ];
  const hits = impactOf(nodes, edges, "host");
  assert.equal(hits.find((hit) => hit.name === "FS01")?.severity, "direct");
  assert.equal(hits.find((hit) => hit.name === "File share")?.severity, "direct");
});

test("sends_data_to slows the receiver when the sender fails", () => {
  const nodes = [
    { id: "a", name: "Order Entry" },
    { id: "b", name: "Invoicing" },
  ];
  const edges: ImpactEdge[] = [{ type: "sends_data_to", fromId: "a", toId: "b" }];
  const hits = impactOf(nodes, edges, "a");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.name, "Invoicing");
  assert.equal(hits[0]?.severity, "degraded");
  assert.equal(impactOf(nodes, edges, "b").length, 0);
});
