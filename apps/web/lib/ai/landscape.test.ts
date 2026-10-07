import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "../../../../packages/types/src/fixtures/ai-landscape.fixture.json";
import { agentChain, aiLandscape, sensitiveKinds, type LandscapeEdge, type LandscapeObject } from "./landscape";
import { summarize } from "./landscape.test-helpers";

type Obj = LandscapeObject;
const sample = fixture as unknown as { objects: Obj[]; relationships: LandscapeEdge[]; expected: unknown };

const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}, extra: Partial<Obj> = {}): Obj => ({
  id,
  type,
  name,
  status: "active",
  properties,
  ...extra,
});
const rel = (type: string, from: string, to: string): LandscapeEdge => ({ id: `${type}-${from}-${to}`, type, from_object_id: from, to_object_id: to });
const feature = (key: string, name: string, extra: Record<string, unknown> = {}) => ({
  key,
  name,
  status: "on",
  sees_company_data: "yes",
  vendor_trains: "no",
  source: "catalog",
  ...extra,
});
const agent = (id: string, props: Record<string, unknown> = {}, extra: Partial<Obj> = {}) =>
  obj(id, "agent", id, { job: "other", autonomy_level: "act_with_approval", acts_as: { type: "service_account", name: "svc" }, ...props }, { owner: "Ops", ...extra });
const model = obj("m", "ai_model", "Model", { vendor_trains: "no" });
const flagsOf = (objects: Obj[], relationships: LandscapeEdge[], id?: string) =>
  aiLandscape({ objects, relationships }).flags.filter((flag) => !id || flag.id === id);

test("sample company produces exactly the expected output", () => {
  assert.deepEqual(summarize(sample), sample.expected);
  const result = aiLandscape(sample);
  assert.equal(result.places, 14);
  assert.equal(result.highFlags, 9);
  assert.equal(result.spend.total, 16980);
  assert.equal(result.spend.addOns, 12900);
  assert.equal(result.unreviewed.length, 4);
});

test("F1: sensitive host, ['none'] suppresses, unknown is a check", () => {
  const crm = obj("crm", "application", "CRM", { category: "CRM", ai_features: [feature("f", "Helper")] });
  assert.equal(flagsOf([crm], [], "F1")[0].severity, "high");
  const none = obj("crm", "application", "CRM", { category: "CRM", holds_data: ["none"], ai_features: [feature("f", "Helper")] });
  assert.equal(flagsOf([none], [], "F1").length, 0);
  const unsure = obj("crm", "application", "CRM", { category: "CRM", ai_features: [feature("f", "Helper", { sees_company_data: "unknown" })] });
  assert.equal(flagsOf([unsure], [], "F1")[0].severity, "check");
  const off = obj("crm", "application", "CRM", { category: "CRM", ai_features: [feature("f", "Helper", { status: "off" })] });
  assert.equal(flagsOf([off], [], "F1").length, 0);
});

test("F1: a data_store inherits from what feeds it, one hop only", () => {
  const erp = obj("erp", "cloud_service", "Dynamics 365", { platform_type: "erp" });
  const lake = obj("lake", "data_store", "Sales lakehouse");
  const mart = obj("mart", "data_store", "Mart");
  const sales = agent("Sales Assistant");
  const objects = [erp, lake, mart, sales, model];
  const oneHop = [rel("sends_data_to", "erp", "lake"), rel("reads", sales.id, "lake")];
  assert.deepEqual([...sensitiveKinds(lake, objects, oneHop).kinds], ["customer", "financial"]);
  const flag = flagsOf(objects, oneHop, "F1");
  assert.equal(flag.length, 1);
  assert.deepEqual(flag[0].itemIds, ["Sales Assistant"]);
  assert.match(flag[0].why, /gets data from Dynamics 365/);

  const twoHop = [rel("sends_data_to", "erp", "lake"), rel("writes", "lake", "mart"), rel("reads", sales.id, "mart")];
  assert.equal(flagsOf(objects, twoHop, "F1").length, 0);
  const marked = { ...lake, properties: { holds_data: ["none"] } };
  assert.equal(flagsOf([erp, marked, sales, model], oneHop, "F1").length, 0);
});

test("F2: yes is high, unknown is a check, for features and agent models", () => {
  const app = obj("a", "application", "Tool", { ai_features: [feature("f", "Helper", { vendor_trains: "unknown" })] });
  assert.equal(flagsOf([app], [], "F2")[0].severity, "check");
  const trains = obj("a", "application", "Tool", { ai_features: [feature("f", "Helper", { vendor_trains: "yes" })] });
  assert.equal(flagsOf([trains], [], "F2")[0].severity, "high");
  const bot = agent("bot");
  const unknownModel = obj("m", "ai_model", "Model", {});
  assert.equal(flagsOf([bot, unknownModel], [rel("uses_model", "bot", "m")], "F2")[0].severity, "check");
  assert.equal(flagsOf([bot, model], [rel("uses_model", "bot", "m")], "F2").length, 0);
});

test("F3: no owner is high; text, team or person all count as owned", () => {
  assert.equal(flagsOf([agent("bot", {}, { owner: null })], [], "F3")[0].severity, "high");
  assert.equal(flagsOf([agent("bot", {}, { owner: "  Jo  " })], [], "F3").length, 0);
  assert.equal(flagsOf([agent("bot", {}, { owner: null, owner_team_id: "t" })], [], "F3").length, 0);
  assert.equal(flagsOf([agent("bot", {}, { owner: null, point_of_contact_id: "p" })], [], "F3").length, 0);
  assert.equal(flagsOf([agent("bot", {}, { owner: null, status: "planned" })], [], "F3").length, 0);
});

test("F4: writes + autonomy, and suggest-only with write access is a high mismatch", () => {
  const app = obj("app", "application", "Ledger");
  const writes = [rel("writes", "bot", "app")];
  assert.equal(flagsOf([agent("bot", { autonomy_level: "act_autonomously" }), app], writes, "F4")[0].severity, "high");
  assert.equal(flagsOf([agent("bot"), app], writes, "F4")[0].severity, "check");
  const mismatch = flagsOf([agent("bot", { autonomy_level: "suggest" }), app], writes, "F4")[0];
  assert.equal(mismatch.severity, "high");
  assert.match(mismatch.why, /suggests only.*write access to Ledger/);
  assert.equal(flagsOf([agent("bot", { autonomy_level: "act_autonomously" }), app], [rel("reads", "bot", "app")], "F4").length, 0);
});

test("F5: a person's account is high; a team is fine; no identity is a gap, not a flag", () => {
  assert.equal(flagsOf([agent("bot", { acts_as: { type: "contact", id: "c", name: "Dana" } })], [], "F5")[0].severity, "high");
  assert.equal(flagsOf([agent("bot", { acts_as: { type: "team", id: "t", name: "Finance" } })], [], "F5").length, 0);
  const app = obj("app", "application", "Ledger");
  const result = aiLandscape({ objects: [agent("bot", { acts_as: null }), app], relationships: [rel("writes", "bot", "app")] });
  assert.equal(result.flags.filter((flag) => flag.id === "F5").length, 0);
  assert.equal(result.agents[0].identityGap, true);
});

test("F6: same job across records flags; same record or 'other' does not", () => {
  const m365 = obj("m365", "application", "Microsoft 365", {
    ai_features: [feature("m365-copilot", "Copilot"), feature("m365-copilot-chat", "Copilot Chat")],
  });
  assert.equal(flagsOf([m365], [], "F6").length, 0);
  const notion = obj("notion", "application", "Notion", { ai_features: [feature("notion-ai", "Notion AI")] });
  assert.equal(flagsOf([m365, notion], [], "F6").length, 1);
  assert.equal(flagsOf([agent("a"), agent("b")], [], "F6").length, 0);
  const pair = flagsOf([agent("a", { job: "invoice_processing" }), agent("b", { job: "invoice_processing" })], [], "F6");
  assert.equal(pair.length, 1);
  assert.equal(pair[0].severity, "check");
});

test("spend leaves out unreviewed features, data platforms and agent runners", () => {
  const result = aiLandscape(sample);
  const ids = result.platforms.filter((item) => item.counted).map((item) => item.id);
  assert.equal(ids.includes("plat-fabric"), false);
  assert.equal(result.platforms.some((item) => item.id === "plat-fabric"), false);
  assert.equal(ids.includes("tool-n8n"), false);
  assert.equal(result.spend.platforms, 2400 + 1200 + 480);
  const pending = obj("z", "application", "Zendesk", {
    cost_lines: [{ id: "ai-zendesk-copilot", type: "subscription", frequency: "monthly", calculation: { kind: "per_user", seats: 6, unit_price_monthly_cents: 5000 }, vendor: null, source: "estimate", created_at: "", created_by: "", updated_at: "", updated_by: "", ai_feature: "zendesk-copilot" }],
    ai_features: [feature("zendesk-copilot", "Zendesk Copilot", { status: "unreviewed", cost_line_id: "ai-zendesk-copilot" })],
  });
  const only = aiLandscape({ objects: [pending], relationships: [] });
  assert.equal(only.spend.total, 0);
  assert.equal(only.unreviewed.length, 2);
  assert.deepEqual([...only.features, ...only.offFeatures], []);
  assert.equal(only.places, 0);
});

test("empty workspace has nothing to show", () => {
  const result = aiLandscape({ objects: [], relationships: [] });
  assert.equal(result.places, 0);
  assert.deepEqual(result.flags, []);
  assert.equal(result.chainAgentId, null);
});

test("agent chain uses impact-rule lanes and the data_store hop", () => {
  const steps = agentChain("agent-sales", sample.objects, sample.relationships).map((step) => `${step.verb}:${step.targetName}:${step.lane}`);
  assert.deepEqual(steps, [
    "Built with:Copilot Studio:stop",
    "Uses model:GPT-4o:stop",
    "Accessed through:Azure AI Foundry:stop",
    "Reads:Sales lakehouse:slow",
    "Gets data from:Dynamics 365:slow",
    "Writes:Salesforce:risk",
    "Acts as:svc-sales:null",
    "Can call:Quote Builder:slow",
  ]);
});
