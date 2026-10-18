import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractSystemDiagramLinks, SYSTEM_DIAGRAM_OBJECT_TYPES } from "../system-relationship-utils.ts";
import { diagramNodeAccent, diagramTypeLabel, isAiObjectType } from "../diagram-node-styles.ts";

const rel = (id: string, type: string, from: [string, string], to: [string, string]) =>
  ({ id, type, from_object_id: from[0], from_type: from[1], to_object_id: to[0], to_type: to[1], attributes: {} }) as never;

const rels = [
  rel("r1", "reads", ["bot", "agent"], ["crm", "application"]),
  rel("r2", "writes", ["bot", "agent"], ["erp", "application"]),
  rel("r3", "uses_model", ["bot", "agent"], ["gpt", "ai_model"]),
  rel("r4", "escalates_to", ["bot", "agent"], ["desk", "application"]),
];
const names = { bot: "Invoice bot", crm: "Salesforce", erp: "NetSuite", gpt: "GPT-4o", desk: "Zendesk" };

test("AI agents and models are on the relationship map whitelist", () => {
  assert.ok(SYSTEM_DIAGRAM_OBJECT_TYPES.has("agent" as never));
  assert.ok(SYSTEM_DIAGRAM_OBJECT_TYPES.has("ai_model" as never));
});

test("agent map shows its apps and model (outbound)", () => {
  const links = extractSystemDiagramLinks("bot", rels, names);
  assert.deepEqual(links.map((l) => [l.name, l.direction, l.relationshipType]).sort(), [
    ["GPT-4o", "outbound", "uses_model"],
    ["NetSuite", "outbound", "writes"],
    ["Salesforce", "outbound", "reads"],
    ["Zendesk", "outbound", "escalates_to"],
  ]);
});

test("app map shows the agent linking to it (inbound); model map shows the agent", () => {
  const app = extractSystemDiagramLinks("crm", rels, names);
  assert.deepEqual(app.map((l) => [l.name, l.objectType, l.direction]), [["Invoice bot", "agent", "inbound"]]);
  const model = extractSystemDiagramLinks("gpt", rels, names);
  assert.deepEqual(model.map((l) => [l.name, l.objectType, l.direction]), [["Invoice bot", "agent", "inbound"]]);
});

test("AI nodes have their own violet style and plain labels", () => {
  assert.ok(isAiObjectType("agent") && isAiObjectType("ai_model") && !isAiObjectType("application"));
  assert.equal(diagramNodeAccent("agent" as never).handle, "#7c3aed");
  assert.equal(diagramNodeAccent("ai_model" as never).handle, "#7c3aed");
  assert.notEqual(diagramNodeAccent("component" as never).handle, "#7c3aed");
  assert.equal(diagramTypeLabel("agent" as never), "AI agent");
  assert.equal(diagramTypeLabel("ai_model" as never), "AI model");
  const icons = readFileSync(new URL("../../components/shared/DiagramNodes.tsx", import.meta.url), "utf8");
  assert.match(icons, /case "ai_model":\s*return <Sparkles/);
});

test("every record's Relationships tab renders the map, not only applications", () => {
  const panel = readFileSync(new URL("../../components/mvp/ModelDetailPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /if \(row\.kind === "application"\) \{\s*const nameById/);
  assert.match(panel, /\{map\}\s*<ObjectRelationshipsTab/);
  // Platforms and servers don't repeat their hosted items above the connections list.
  assert.doesNotMatch(panel, /HOSTED OR BUILT HERE|BUILT ON THIS PLATFORM|\{lists\}/);
});
