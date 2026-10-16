/** Lean Ask card: short headline, gap/kind chips, 5 rows then "Show N more", footer How + ≤2 follow-ups, one-line thread. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { answerFromRecords, recordsAnswer, recordsFromPayload } from "./deterministic";
import { buildFacts, filterFacts } from "./record-filter";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import { AskRecordsBlock, leanSummary } from "@/components/mvp/AskRecords";
import { shortQuestion } from "@/components/mvp/AskScreen";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, type, name, properties, tags: [], ...extra }) as never;
const MS = Array.from({ length: 7 }, (_, i) =>
  obj(`ms${i}`, i < 4 ? "cloud_service" : "application", `Microsoft Thing ${i}`, { vendor: "Microsoft", ...(i === 0 ? { annual_cost: 43200 } : {}) }, i < 2 ? { owner: "IT", owner_team_name: "IT" } : {}),
);
const OBJECTS = [obj("ps", "application", "Adobe Photoshop", { hosting_model: "desktop" }), ...MS];
const rows = (objects = OBJECTS) => objects.map(rowFromObject).filter(Boolean) as CatalogRow[];
const ask = (question: string) => answerFromRecords({ question, rows: rows(), graph: { nodes: [], edges: [] }, basePath: "/w", landscape: { objects: OBJECTS as never, relationships: [] } });
const facts = () => buildFacts(rows(), OBJECTS as never, []);
const render = (answer: ReturnType<typeof ask>, yesNo?: boolean) =>
  renderToStaticMarkup(<AskRecordsBlock defaultDetails answer={answer} facts={facts()} yesNo={yesNo} onFilters={() => {}} onOpen={() => {}} rowHref={(row) => `/w/r/${row.id}`} />);


test("multi: '7 items', kind + gap counts, 5 rows then Show 2 more, ≤2 follow-ups, no row badges", () => {
  const a = ask("What Microsoft products do we own?");
  const s = leanSummary(filterFacts(facts(), a.records!.filters), a.records!.filters, false);
  assert.equal(s.title, "7 items");
  assert.deepEqual(s.gaps, ["5 no owner", "6 no cost"]);
  assert.equal(s.kinds.reduce((n, k) => n + k.count, 0), 7);
  assert.equal(s.inferredVendor, false);
  const html = render(a);
  assert.equal((html.match(/<tr class="cursor-pointer/g) ?? []).length, 5);
  assert.match(html, /Show 2 more/);
  assert.match(html, /\$43,200|43,200/);
  const pills = html.split('data-testid="ask-narrow"')[1].split("</div>")[0];
  assert.ok((pills.match(/<button/g) ?? []).length <= 2);
  assert.doesNotMatch(html, /rounded-full bg-\[#f4f3ff\]/);
});

test("AI answers use the same lean card (records from filter_records)", () => {
  const records = recordsFromPayload({ filters: { vendor: "Adobe" } })!;
  const html = render(recordsAnswer(records, facts(), "Oct 16"), true);
  assert.match(html, /Yes —/);
  assert.match(html, /Vendor from catalogue/);
});


test("earlier conversation is one line of short question chips", () => {
  assert.equal(shortQuestion("What Microsoft products do we own?"), "Microsoft products?");
  assert.equal(shortQuestion("Do we use Adobe?"), "Do we use Adobe?");
  const src = readFileSync("components/mvp/AskScreen.tsx", "utf8");
  assert.doesNotMatch(src, /Earlier in this conversation/);
  assert.match(src, /Earlier ·/);
});
