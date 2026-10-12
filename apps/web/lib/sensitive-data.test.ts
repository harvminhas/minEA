import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import fixture from "../../../packages/types/src/fixtures/sensitive-data.fixture.json";
import { aiLandscape, type LandscapeEdge, type LandscapeObject } from "./ai/landscape.ts";
import { featureFlags } from "./ai/features.ts";
import { AGENT_DATA_TARGETS } from "./fields/registry.ts";
import rules from "../../../packages/types/src/relationship-rules.json";
import {
  CHECKLIST_QUESTION,
  buildSensitiveRows,
  checklistInitial,
  checklistPatches,
  needsChecklist,
  type SdEdge,
  type SdObject,
} from "./sensitive-data.ts";

const app = (id: string, name: string, properties: Record<string, unknown> = {}): SdObject => ({ id, type: "application", name, status: "active", properties });
const crm = app("crm", "Salesforce", { category: "crm" });
const hr = app("hr", "Workday", { category: "hr" });
const wiki = app("wiki", "Wiki", { holds_data: ["none"] });
const billing = app("billing", "Billing", {
  holds_data: ["financial"],
  ai_features: [{ key: "b-ai", name: "Billing copilot", status: "on", sees_company_data: "yes", vendor_trains: "no", source: "user" }],
});

test("the checklist asks one question and pre-ticks from catalog categories", () => {
  assert.equal(CHECKLIST_QUESTION, "Which of these hold customer / employee / financial data?");
  const objects = [crm, hr, wiki, billing];
  assert.equal(needsChecklist(objects), true);
  assert.deepEqual(checklistInitial(objects), { billing: ["financial"], crm: ["customer"], wiki: [], hr: ["employee"] });
  assert.equal(needsChecklist([wiki, billing]), false);
});

test("confirm saves unanswered apps and changed answers only; nothing ticked saves none", () => {
  const objects = [crm, hr, wiki, billing];
  const answers = { ...checklistInitial(objects), hr: [] };
  assert.deepEqual(checklistPatches(objects, answers), [
    { id: "crm", holds_data: ["customer"] },
    { id: "hr", holds_data: ["none"] },
  ]);
});

test("rows: built-in types plus custom ones, the apps that hold each, and the AI that can reach it", () => {
  const health: SdObject = { id: "dh", type: "data_object", name: "Health", properties: { sensitive_kind: "health" } };
  const students: SdObject = { id: "ds", type: "data_object", name: "Student records", properties: { sensitive_kind: "custom" } };
  const legacy: SdObject = { id: "dl", type: "data_object", name: "Order", properties: {} };
  const agent: SdObject = { id: "ag", type: "agent", name: "Refund bot", status: "active" };
  const idle: SdObject = { id: "ag2", type: "agent", name: "Old bot", status: "retired" };
  const edges: SdEdge[] = [
    { type: "owns", from_object_id: "wiki", to_object_id: "dh" },
    { type: "owns", from_object_id: "hr", to_object_id: "ds" },
    { type: "reads", from_object_id: "ag", to_object_id: "billing" },
    { type: "writes", from_object_id: "ag", to_object_id: "ds" },
    { type: "reads", from_object_id: "ag2", to_object_id: "billing" },
  ];
  const rows = buildSensitiveRows([crm, hr, wiki, billing, health, students, legacy, agent, idle], edges);
  assert.deepEqual(rows.map((row) => row.label), ["Customer", "Employee", "Financial", "Health", "Payment card", "Student records"]);
  const by = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.deepEqual(by.Customer.apps, [{ id: "crm", name: "Salesforce", suggested: true }]);
  assert.deepEqual(by.Financial.apps, [{ id: "billing", name: "Billing", suggested: false }]);
  assert.deepEqual(by.Financial.ai.map((ai) => [ai.kind, ai.name, ai.via]), [["agent", "Refund bot", "reads Billing"], ["feature", "Billing copilot", "Billing"]]);
  assert.deepEqual(by.Health.apps.map((a) => a.name), ["Wiki"]);
  assert.deepEqual(by["Student records"].apps.map((a) => a.name), ["Workday"]);
  assert.deepEqual(by["Student records"].ai.map((ai) => ai.via), ["writes Student records"]);
  assert.deepEqual(by["Payment card"].apps, []);
});

test("F1: apps linked to sensitive data count, and agents can link to data entities (same fixture as Python)", () => {
  const result = aiLandscape({ objects: fixture.objects as LandscapeObject[], relationships: fixture.relationships as LandscapeEdge[] });
  const got = result.flags.filter((flag) => flag.id === "F1").map((flag) => ({ itemIds: flag.itemIds, why: flag.why }));
  const key = (f: { itemIds: string[] }) => f.itemIds.join();
  assert.deepEqual(got.sort((a, b) => key(a).localeCompare(key(b))), [...fixture.expected_f1].sort((a, b) => key(a).localeCompare(key(b))));
  assert.ok(AGENT_DATA_TARGETS.includes("data_object"));
  const triples = new Set((rules as string[][]).map((rule) => rule.join("|")));
  assert.ok(triples.has("reads|agent|data_object") && triples.has("writes|agent|data_object"));
});

test("the drawer's feature card uses linked data kinds for F1", () => {
  const feature = { key: "k", name: "K", status: "on" as const, sees_company_data: "yes" as const, vendor_trains: "no" as const, source: "user" as const };
  assert.deepEqual(featureFlags(feature, wiki), []);
  assert.equal(featureFlags(feature, wiki, ["health"])[0]?.id, "F1");
});

test("the default page drops the governance banner; the full entity list stays at ?view=entities", () => {
  const page = readFileSync(new URL("../components/data/SensitiveDataPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /DataGovernanceGapBanner|classification/i);
  assert.match(page, /view"\) === "entities"/);
  const list = readFileSync(new URL("../components/data/DataLayerList.tsx", import.meta.url), "utf8");
  assert.match(list, /DataGovernanceGapBanner/);
});
