import assert from "node:assert/strict";
import { test } from "node:test";
import { IMPACT_LANES, RELATIONSHIP_LABELS, RISK_EDGE_TYPES } from "@minea/types";
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
  const direct = ["depends_on", "runs_on", "built_on", "part_of", "located_at", "uses_model"];
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

test("rules come from impact-rules.json and the AI lanes stop or slow", () => {
  assert.deepEqual(Object.keys(relationshipImpactRules), Object.keys(IMPACT_LANES));
  for (const type of Object.keys(relationshipImpactRules)) {
    assert.ok(type in RELATIONSHIP_LABELS, type);
  }
  assert.deepEqual(RISK_EDGE_TYPES, ["writes"]);
  assert.equal(relationshipImpactRules.uses_model?.whenTargetFails, "direct");
  assert.equal(relationshipImpactRules.can_call?.whenTargetFails, "degraded");
});

test("AI agent impact", () => {
  const nodes: ImpactNode[] = [
    { id: "studio", name: "Copilot Studio" },
    { id: "foundry", name: "Azure AI Foundry" },
    { id: "gpt", name: "GPT-4o" },
    { id: "agent", name: "Sales Assistant" },
    { id: "sf", name: "Salesforce" },
    { id: "d365", name: "Dynamics 365" },
    { id: "lake", name: "Sales lakehouse" },
  ];
  const edges: ImpactEdge[] = [
    { type: "built_on", fromId: "agent", toId: "studio" },
    { type: "runs_on", fromId: "gpt", toId: "foundry" },
    { type: "uses_model", fromId: "agent", toId: "gpt" },
    { type: "writes", fromId: "agent", toId: "sf" },
    { type: "sends_data_to", fromId: "d365", toId: "lake" },
    { type: "reads", fromId: "agent", toId: "lake" },
  ];
  const studio = impactOf(nodes, edges, "studio");
  const assistant = studio.find((hit) => hit.name === "Sales Assistant");
  assert.equal(assistant?.severity, "direct");
  assert.equal(assistant?.indirect, false);
  const foundry = impactOf(nodes, edges, "foundry");
  const byFoundry = new Map(foundry.map((hit) => [hit.name, hit]));
  assert.equal(byFoundry.get("GPT-4o")?.severity, "direct");
  const throughModel = byFoundry.get("Sales Assistant");
  assert.equal(throughModel?.severity, "direct");
  assert.equal(throughModel?.depth, 2);
  assert.equal(
    throughModel?.path.map((step) => step.label).join(", then "),
    "GPT-4o runs on Azure AI Foundry, then Sales Assistant uses model GPT-4o",
  );
  const crm = impactOf(nodes, edges, "sf");
  assert.equal(crm.find((hit) => hit.name === "Sales Assistant")?.severity, "degraded");
  assert.equal(impactOf(nodes, edges, "agent").some((hit) => hit.name === "Salesforce"), false);
  const dynamics = impactOf(nodes, edges, "d365");
  const byDynamics = new Map(dynamics.map((hit) => [hit.name, hit]));
  assert.equal(byDynamics.get("Sales lakehouse")?.severity, "degraded");
  assert.equal(byDynamics.get("Sales Assistant")?.severity, "degraded");
  assert.equal(byDynamics.get("Sales Assistant")?.depth, 2);
});

const m365: ImpactNode[] = [
  { id: "m365", name: "Microsoft 365" },
  { id: "exo", name: "Exchange Online" },
  { id: "sf", name: "Salesforce" },
  { id: "ns", name: "NetSuite" },
  { id: "q2o", name: "Quote-to-order" },
  { id: "intra", name: "Intranet" },
  { id: "tool", name: "Team Tool" },
];

test("Microsoft 365 down: sign-in apps can't sign in and it stops there", () => {
  const edges: ImpactEdge[] = [
    { type: "part_of", fromId: "exo", toId: "m365" },
    { type: "authenticates_via", fromId: "sf", toId: "m365" },
    { type: "authenticates_via", fromId: "ns", toId: "m365" },
    { type: "depends_on", fromId: "q2o", toId: "sf" },
  ];
  const hits = impactOf(m365, edges, "m365");
  const byName = new Map(hits.map((hit) => [hit.name, hit]));
  assert.equal(byName.get("Exchange Online")?.severity, "direct");
  assert.equal(byName.get("Salesforce")?.severity, "loses_sign_in");
  assert.equal(byName.get("NetSuite")?.severity, "loses_sign_in");
  assert.equal(byName.get("Salesforce")?.path[0]?.label, "Salesforce signs in with Microsoft 365");
  assert.equal(byName.has("Quote-to-order"), false, "Salesforce is still running, so its dependents are not hit");
  assert.equal(relationshipImpactRules.authenticates_via?.step("Salesforce", "Microsoft 365"), "Signs in with Microsoft 365");
});

test("worst link wins: built on and signs in with the same record is a stop that cascades", () => {
  const edges: ImpactEdge[] = [
    { type: "authenticates_via", fromId: "intra", toId: "m365" },
    { type: "built_on", fromId: "intra", toId: "m365" },
    { type: "depends_on", fromId: "tool", toId: "intra" },
  ];
  const hits = impactOf(m365, edges, "m365");
  const byName = new Map(hits.map((hit) => [hit.name, hit]));
  assert.equal(byName.get("Intranet")?.severity, "direct");
  assert.equal(byName.get("Intranet")?.path[0]?.type, "built_on");
  assert.equal(byName.get("Team Tool")?.severity, "direct");
  assert.equal(byName.get("Team Tool")?.indirect, true);
});

test("worst link wins for existing lanes too: runs on beats reads from", () => {
  const nodes = [
    { id: "srv", name: "Server" },
    { id: "app", name: "App" },
  ];
  const edges = [
    { type: "reads", fromId: "app", toId: "srv" },
    { type: "runs_on", fromId: "app", toId: "srv" },
  ];
  assert.equal(impactOf(nodes, edges, "srv")[0]?.severity, "direct");
});

test("a can't-sign-in hit gives way to a stop found one step further", () => {
  const edges: ImpactEdge[] = [
    { type: "authenticates_via", fromId: "sf", toId: "m365" },
    { type: "part_of", fromId: "exo", toId: "m365" },
    { type: "depends_on", fromId: "sf", toId: "exo" },
    { type: "depends_on", fromId: "q2o", toId: "sf" },
  ];
  const hits = impactOf(m365, edges, "m365");
  const byName = new Map(hits.map((hit) => [hit.name, hit]));
  assert.equal(byName.get("Salesforce")?.severity, "direct");
  assert.equal(byName.get("Salesforce")?.depth, 2);
  assert.equal(byName.get("Quote-to-order")?.severity, "direct");
});

test("sign-in is a terminal lane in the shared rules", () => {
  assert.deepEqual(IMPACT_LANES.authenticates_via, { whenTargetFails: "loses_sign_in" });
  assert.equal(RELATIONSHIP_LABELS.authenticates_via.forward, "Signs in with");
  assert.equal(RELATIONSHIP_LABELS.authenticates_via.reverse, "Sign-in for");
});
