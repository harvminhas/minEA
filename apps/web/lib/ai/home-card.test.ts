import { test } from "node:test";
import assert from "node:assert/strict";
import { aiHomeCard, aiHomeCardLabel } from "./home-card";
import { aiLandscape, type LandscapeEdge, type LandscapeObject } from "./landscape";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}, extra: Partial<LandscapeObject> = {}): LandscapeObject => ({
  id,
  type,
  name,
  status: "active",
  properties,
  ...extra,
});
/** An agent with an owner, approval-only and no write access: raises no flags. */
const agent = (id: string, status: string, extra: Partial<LandscapeObject> = {}) =>
  obj(id, "agent", id, { job: "other", autonomy_level: "act_with_approval", acts_as: { type: "service_account", name: "svc" } }, { owner: "Ops", status, ...extra });
const app = (id: string, name: string, status = "on") =>
  obj(id, "application", name, {
    holds_data: ["none"],
    ai_features: [{ key: `${id}-ai`, name: `${name} AI`, status, sees_company_data: "no", vendor_trains: "no", source: "manual" }],
  });

function card(objects: LandscapeObject[], relationships: LandscapeEdge[] = []) {
  const result = aiHomeCard(aiLandscape({ objects, relationships }));
  return result ? aiHomeCardLabel(result) : null;
}

test("AI card: places and agents running, plural", () => {
  assert.equal(card([app("crm", "Order Entry"), agent("a", "active"), agent("b", "active")]), "AI in 3 places · 2 agents running");
});

test("AI card: singulars", () => {
  assert.equal(card([agent("a", "active")]), "AI in 1 place · 1 agent running");
});

test("AI card: no agents running drops the agents part", () => {
  assert.equal(card([app("crm", "Order Entry"), app("erp", "Ledger")]), "AI in 2 places");
  assert.equal(card([app("crm", "Order Entry"), agent("idea", "planned"), agent("old", "retired")]), "AI in 1 place");
});

test("AI card: piloting agents are appended (and counted in places, like the report)", () => {
  assert.equal(card([agent("a", "active"), agent("b", "active"), agent("p", "under_evaluation")]), "AI in 3 places · 2 agents running · 1 piloting");
  assert.equal(card([agent("p", "under_evaluation")]), "AI in 1 place · 1 piloting");
});

test("AI card: places match the report's strip", () => {
  const objects = [app("crm", "Order Entry"), agent("a", "active"), agent("p", "under_evaluation"), obj("m", "ai_model", "Model", { vendor_trains: "no" })];
  const result = aiLandscape({ objects, relationships: [] });
  assert.equal(result.places, 4);
  assert.equal(aiHomeCard(result)?.text, "AI in 4 places · 1 agent running · 1 piloting");
});

test("AI card: high flags", () => {
  const one = aiHomeCard(aiLandscape({ objects: [agent("a", "active", { owner: "" })], relationships: [] }));
  assert.deepEqual(one, { text: "AI in 1 place · 1 agent running", action: null, flag: "1 high flag" });
  assert.equal(card([agent("a", "active", { owner: "" }), agent("b", "active", { owner: "" })]), "AI in 2 places · 2 agents running · 2 high flags");
  assert.equal(aiHomeCard(aiLandscape({ objects: [agent("a", "active")], relationships: [] }))?.flag, null);
});

test("AI card: suggestions only", () => {
  assert.deepEqual(aiHomeCard(aiLandscape({ objects: [obj("m365", "application", "Microsoft 365")], relationships: [] })), {
    text: "AI may be on in 1 app",
    action: "Review",
    flag: null,
  });
  assert.equal(card([obj("m365", "application", "Microsoft 365"), obj("zd", "application", "Zendesk"), agent("idea", "planned")]), "AI may be on in 2 apps · Review");
});

test("AI card: nothing at all shows no card", () => {
  assert.equal(card([]), null);
  assert.equal(card([obj("crm", "application", "Order Entry")]), null);
  assert.equal(card([app("crm", "Order Entry", "off"), agent("idea", "planned")]), null);
});
