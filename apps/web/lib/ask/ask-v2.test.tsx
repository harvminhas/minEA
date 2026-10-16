/** Ask v2: quick list answers from names in the workspace data, editable filters, helpful can't-answer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { answerFromModel, answerFromRecords, cantAnswer, recordsAnswer } from "./deterministic";
import { buildFacts, FILTER_KEYS, filtersFromPayload, matchQuestion } from "./record-filter";
import { localOnly, shouldAskModel } from "./route";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import { AskRecordsBlock } from "@/components/mvp/AskRecords";
import { aiQuestionsLabel } from "@/components/billing/BillingCentre";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, type, name, properties, tags: [], ...extra }) as never;
const OBJECTS = [
  obj("m365", "application", "Microsoft 365", { vendor: "Microsoft", annual_cost: 43200, hosting_model: "saas" }, { owner: "IT Ops", owner_team_name: "IT Ops" }),
  obj("teams", "application", "Teams", { vendor: "Microsoft", hosting_model: "saas" }, { owner: "IT Ops", owner_team_name: "IT Ops" }),
  obj("pbi", "application", "Power BI", { vendor: "Microsoft", annual_cost: 6000, hosting_model: "saas" }, { owner: "Finance", owner_team_name: "Finance" }),
  obj("ebs", "application", "E-Business Suite", { vendor: "Oracle", annual_cost: 90000, hosting_model: "on_premise" }, { owner: "Finance", owner_team_name: "Finance" }),
  obj("odb", "model", "ORA-DB-01", { vendor: "Oracle", runtime_kind: "physical_server" }),
  obj("tenant", "cloud_service", "Contoso Azure", { platform_kind: "cloud_account", vendor: "microsoft", cloud_provider: "azure" }),
  obj("claims", "application", "Claims Portal", { hosting_model: "own_cloud", is_custom_built: true, ai_features: [{ key: "aoai", name: "Azure OpenAI summaries", status: "on" }] }),
  obj("notes", "application", "Field Notes", { hosting_model: "own_cloud", ai_features: [{ key: "cs", name: "Copilot Studio", status: "on" }] }, { owner: "Ops", owner_team_name: "Ops" }),
  obj("slack", "application", "Slack", { vendor: "Salesforce", hosting_model: "saas" }, { owner: "IT Ops", owner_team_name: "IT Ops" }),
];
const RELS = [
  { id: "r1", type: "runs_on", from_object_id: "claims", to_object_id: "tenant", from_type: "application", to_type: "cloud_service", attributes: { region_key: "azure:canadacentral" } },
  { id: "r2", type: "runs_on", from_object_id: "notes", to_object_id: "tenant", from_type: "application", to_type: "cloud_service", attributes: { region_key: "azure:canadaeast" } },
];
const ROWS = OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[];
const ask = (question: string, objects = OBJECTS, rels = RELS) =>
  answerFromRecords({ question, rows: objects.map(rowFromObject).filter(Boolean) as CatalogRow[], graph: { nodes: [], edges: [] }, basePath: "/w", landscape: { objects: objects as never, relationships: rels as never } });
const names = (answer: ReturnType<typeof ask>) => answer.citations.map((c) => c.row.name).sort();
const gate = (question: string, local: ReturnType<typeof ask>) =>
  shouldAskModel({ mode: "answer", question, showingAdd: false, ambiguous: false, hasWorkspace: true, catalogSettled: true, local });

test("'What Microsoft products do we own?' answers locally from the vendor data, no AI call", () => {
  const answer = ask("What Microsoft products do we own?");
  assert.equal(answer.handler, "records");
  assert.deepEqual(answer.records?.filters, { vendor: "Microsoft" });
  assert.equal(answer.records?.source, "quick");
  // The Azure tenant counts through its provider's vendor (from cloud-regions.json, not a hardcoded name).
  assert.deepEqual(names(answer), ["Contoso Azure", "Microsoft 365", "Power BI", "Teams"]);
  assert.match(answer.answerText, /match vendor Microsoft/);
  assert.match(answer.answerText, /\$49,200 a year/);
  assert.equal(localOnly(answer, "What Microsoft products do we own?"), true);
  assert.equal(gate("What Microsoft products do we own?", answer), false);
});

test("'What Oracle apps do we have?' answers from data the same way", () => {
  const answer = ask("What Oracle apps do we have?");
  assert.equal(answer.handler, "records");
  assert.deepEqual(names(answer), ["E-Business Suite", "ORA-DB-01"]);
  assert.equal(gate("What Oracle apps do we have?", answer), false);
});

test("nothing is hardcoded: an unknown vendor isn't matched until it exists in the data", () => {
  assert.notEqual(ask("What Zyxware products do we own?").handler, "records");
  const withZyx = [...OBJECTS, obj("z", "application", "Zyx CRM", { vendor: "Zyxware" })];
  assert.deepEqual(names(ask("What Zyxware products do we own?", withZyx)), ["Zyx CRM"]);
});

test("owner teams, tenants and regions from the data are matched too", () => {
  assert.deepEqual(names(ask("What does Finance own?")), ["E-Business Suite", "Power BI"]);
  assert.deepEqual(names(ask("What runs in Contoso Azure?")), ["Claims Portal", "Contoso Azure", "Field Notes"]);
  assert.deepEqual(names(ask("What do we have in Canada East?")), ["Field Notes"]);
});

test("compound: Azure + Canada Central + AI on + no owner", () => {
  const q = "Which Azure apps in Canada Central have AI turned on and no owner?";
  const answer = ask(q);
  assert.equal(answer.handler, "records");
  assert.deepEqual(answer.records?.filters, { provider: "azure", region: "azure:canadacentral", owner: "none", ai_on: true });
  assert.deepEqual(names(answer), ["Claims Portal"]);
});

test("short names only match with the same case (a team called IT isn't 'it')", () => {
  const withIt = [...OBJECTS, obj("x", "application", "Helpdesk", {}, { owner: "IT", owner_team_name: "IT" })];
  const facts = buildFacts(withIt.map(rowFromObject).filter(Boolean) as CatalogRow[], withIt as never, RELS as never);
  assert.deepEqual(matchQuestion("what is it for?", facts).terms, []);
  assert.equal(matchQuestion("What does IT own?", facts).filters.owner_team, "IT");
});

test("chip edits re-run locally: vendor switched to Oracle, a filter removed", () => {
  const facts = buildFacts(ROWS, OBJECTS as never, RELS as never);
  const first = ask("What Microsoft products do we own?");
  const oracle = recordsAnswer({ ...first.records!, filters: { vendor: "Oracle" } }, facts, "Oct 16");
  assert.deepEqual(oracle.citations.map((c) => c.row.name).sort(), ["E-Business Suite", "ORA-DB-01"]);
  const narrowed = recordsAnswer({ ...first.records!, filters: { vendor: "Microsoft", owner_team: "Finance" } }, facts, "Oct 16");
  assert.deepEqual(narrowed.citations.map((c) => c.row.name), ["Power BI"]);
  const none = recordsAnswer({ ...first.records!, filters: { vendor: "Oracle", ai_on: true } }, facts, "Oct 16");
  assert.match(none.answerText, /Nothing in this workspace matches/);
});

test("the AI's filter_records filters become editable chips on its answer", () => {
  const payload = {
    source: "llm", fallback_reason: null, answer_text: "You have 4 Microsoft products [1].", citations: [{ n: 1, record_id: "m365", name: "Microsoft 365", type_label: "Application", kind: "", owner: "", criticality: "", relationship: "" }],
    gaps: [], follow_ups: ["a"], tools_used: ["filter_records"], filters: { vendor: "Microsoft", ai_on: "true", bogus: "x", cost_min: "1000" },
  } as never;
  const answer = answerFromModel(payload, ROWS, "/w", "Show me everything from Microsoft over $1000 with AI on");
  assert.deepEqual(answer?.records, { filters: { vendor: "Microsoft", ai_on: true, cost_min: 1000 }, terms: [], source: "ai" });
  assert.deepEqual(filtersFromPayload({ hosting: "own_cloud", renewal_within_days: 90 }), { hosting: "own_cloud", renewal_within_days: 90 });
});

test("can't answer says what it understood and what data is missing, with a link", () => {
  const facts = buildFacts(ROWS, OBJECTS as never, RELS as never);
  const renew = cantAnswer("When do our contracts come up for renewal?", ROWS, facts, "/w", "Oct 16");
  assert.equal(renew.handler, "unsupported");
  assert.match(renew.answerText, /To answer this I need renewal dates/);
  assert.deepEqual(renew.gaps, [{ text: "No item has renewal dates yet. Add them to answer this.", fillHref: "/w/model/applications" }]);
  const vague = ask("Tell me a joke about our estate");
  assert.equal(vague.handler, "unsupported");
  assert.match(vague.answerText, /couldn't match this to anything in your workspace/);
  assert.match(cantAnswer("anything", [], [], "/w", "Oct 16").answerText, /Nothing is recorded/);
});

test("fixed handlers keep their questions (impact, who owns, renewals without a name)", () => {
  assert.equal(ask("What breaks if Contoso Azure goes down?").handler, "impact");
  assert.notEqual(ask("Who owns Power BI?").handler, "records");
  assert.equal(ask("What renews in the next 90 days?").handler, "renewals");
});

test("records block renders chips, a linked table and How I found this", () => {
  const answer = ask("What Microsoft products do we own?");
  const facts = buildFacts(ROWS, OBJECTS as never, RELS as never);
  const html = renderToStaticMarkup(<AskRecordsBlock answer={answer} facts={facts} onFilters={() => {}} onOpen={() => {}} rowHref={(row) => `/w/model/applications/${row.id}`} />);
  assert.match(html, /data-filter="vendor"/);
  assert.match(html, /href="\/w\/model\/applications\/m365"/);
  assert.match(html, /How I found this/);
  assert.match(html, /“microsoft” \(vendor in your data\)/i);
  assert.match(html, /with no AI used/);
  assert.match(html, /Renewing in 90 days\?/);
});

test("filter keys match the API's filter_records", () => {
  const py = readFileSync(new URL("../../../api/app/ai/ask/record_filters.py", import.meta.url), "utf8");
  const block = py.match(/FILTER_KEYS = \(([\s\S]*?)\)/)![1];
  assert.deepEqual([...block.matchAll(/"(\w+)"/g)].map((m) => m[1]), FILTER_KEYS);
});

test("Plan & billing usage label", () => {
  assert.equal(aiQuestionsLabel(7, 25), "7 of 25 used this month");
  assert.equal(aiQuestionsLabel(1200, 5000), "1,200 of 5,000 used this month");
});
