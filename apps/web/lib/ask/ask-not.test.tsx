/** "what is not owned by CRM?": the AI picks is_not; the card shows the AI's own headline and an
 * operator chip. No local headline templating ("owned by not X") exists. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { answerFromModel } from "./deterministic";
import { buildFacts, filterFacts, filterLine, filtersFromPayload, withFilter } from "./record-filter";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import { AskRecordsBlock } from "@/components/mvp/AskRecords";
import type { AskModelPayload } from "@/lib/api-client";

const obj = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, type: "application", name, properties: {}, tags: [], ...extra }) as never;
const OBJECTS = [
  obj("sf", "Salesforce", { owner_team_name: "CRM" }),
  obj("hub", "HubSpot", { owner_team_name: "CRM" }),
  obj("pay", "Payroll", { owner_team_name: "Finance" }),
  obj("wiki", "Wiki", { owner_team_name: "IT" }),
  obj("old", "Old tool"),
];
const ROWS = OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[];
const FACTS = buildFacts(ROWS, OBJECTS as never, []);
const ids = (filters: Record<string, unknown>) => filterFacts(FACTS, filtersFromPayload(filters)).map((f) => f.row.id).sort();

test("operators match like the API", () => {
  assert.deepEqual(ids({ owner_team: "CRM", ops: { owner_team: "is_not" } }), ["old", "pay", "wiki"]);
  assert.deepEqual(ids({ ops: { owner_team: "is_empty" } }), ["old"]);
  assert.deepEqual(ids({ ops: { owner_team: "is_not_empty" } }), ["hub", "pay", "sf", "wiki"]);
  assert.deepEqual(ids({ owner_team: "fin", ops: { owner_team: "contains" } }), ["pay"]);
  assert.deepEqual(ids({ owner_team: "CRM, IT", ops: { owner_team: "any_of" } }), ["hub", "sf", "wiki"]);
});

test("values are used as given (no rewriting of 'not X')", () => {
  assert.deepEqual(filtersFromPayload({ owner_team: "not CRM" }), { owner_team: "not CRM" });
});

test("fake model picks is_not: AI headline as written, chip 'Owner team is not CRM' with an operator dropdown", () => {
  const payload = { source: "llm", fallback_reason: null, answer_text: "3 items are not owned by CRM.", headline: "3 items aren't owned by CRM", citations: [], gaps: [], follow_ups: [], tools_used: ["filter_records"], filters: { owner_team: "CRM", ops: { owner_team: "is_not" } } } as unknown as AskModelPayload;
  const ai = answerFromModel(payload, ROWS, "/w", "what is not owned by CRM?")!;
  const html = renderToStaticMarkup(<AskRecordsBlock defaultDetails answer={ai} facts={FACTS} onFilters={() => {}} onOpen={() => {}} rowHref={(row) => `/w/r/${row.id}`} />);
  assert.match(html, /data-testid="ask-lean-headline"[^>]*>3 items aren(&#x27;|')t owned by CRM</);
  assert.match(html, /data-op="is_not"/);
  assert.match(html, /<option value="is_not" selected="">is not<\/option>/);
  assert.equal(filterLine("owner_team", ai.records!.filters), "Owner team is not CRM");
  assert.doesNotMatch(html, /owned by not/);
  assert.match(html, />Payroll</);
  assert.doesNotMatch(html, />Salesforce</);
});

test("changing the operator re-runs locally", () => {
  const next = withFilter({ owner_team: "CRM" }, "owner_team", "", "is_empty");
  assert.deepEqual(next, { owner_team: "", ops: { owner_team: "is_empty" } });
  assert.deepEqual(filterFacts(FACTS, next).map((f) => f.row.id), ["old"]);
});

test("no local owner-headline templating is left", () => {
  for (const file of ["components/mvp/AskRecords.tsx", "lib/ask/record-filter.ts"]) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /Nothing owned by|owned by \$\{/, file);
  }
});
