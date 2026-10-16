/** AI-first Ask: every typed question goes to the AI; names are hints; pills are structured (no quota). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { answerFromModel, nameMatchAnswer } from "./deterministic";
import { buildFacts } from "./record-filter";
import * as recordFilter from "./record-filter";
import * as route from "./route";
import { nameHints } from "./names";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import { AskRecordsBlock } from "@/components/mvp/AskRecords";
import { aiFallbackNote, fallbackSub, requestError } from "@/components/mvp/AskScreen";
import type { AskModelPayload } from "@/lib/api-client";

const obj = (id: string, name: string, extra: Record<string, unknown> = {}, properties: Record<string, unknown> = {}) => ({ id, type: "application", name, properties, tags: [], ...extra }) as never;
const OBJECTS = [
  obj("ps", "Adobe Photoshop", {}, { hosting_model: "desktop" }),
  obj("pay", "Payroll", { owner_team_name: "Finance", point_of_contact_name: "Christine Wong" }),
  obj("crm", "Salesforce", { owner: "Christine Wong" }, { vendor: "Salesforce" }),
];
const ROWS = OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[];
const FACTS = buildFacts(ROWS, OBJECTS as never, []);
const gate = (question: string, extra: Partial<Parameters<typeof route.shouldAskModel>[0]> = {}) =>
  route.shouldAskModel({ mode: "answer", question, showingAdd: false, ambiguous: false, hasWorkspace: true, catalogSettled: true, ...extra });
const payload = (extra: Partial<AskModelPayload>): AskModelPayload =>
  ({ source: "llm", fallback_reason: null, answer_text: "", citations: [], gaps: [], follow_ups: [], tools_used: ["filter_records"], ...extra }) as AskModelPayload;
const render = (answer: NonNullable<ReturnType<typeof answerFromModel>>) =>
  renderToStaticMarkup(<AskRecordsBlock defaultDetails answer={answer} facts={FACTS} yesNo={Boolean(answer.records?.yesNo)} onFilters={() => {}} onOpen={() => {}} rowHref={(row) => `/w/r/${row.id}`} />);

test("every typed question goes to the AI (no phrasing decides)", () => {
  for (const q of ["do we use Adobe?", "what is owned by Christine?", "What Microsoft products do we own?", "What breaks if Payroll goes down?", "What can we cancel?", "hello"]) {
    assert.equal(gate(q), true, q);
  }
  assert.equal(gate("   "), false);
  assert.equal(gate("x", { estateEmpty: true }), false);
  assert.equal(gate("x", { hasWorkspace: false }), false);
  assert.equal(gate("x", { showingAdd: true }), false);
  assert.equal(gate("x", { catalogSettled: false }), false);
});

test("the phrasing-regex quick answers are gone", () => {
  for (const name of ["yesNoSlot", "ownerSlot", "slotFilters", "matchOwner"]) assert.equal((recordFilter as Record<string, unknown>)[name], undefined, name);
  assert.equal((route as Record<string, unknown>).LOCAL_ONLY_HANDLERS, undefined);
  assert.equal((route as Record<string, unknown>).localOnly, undefined);
});

test("the AI's answer is shown whenever there is one, including its 'found nothing'", () => {
  const fallback = nameMatchAnswer("do we use Figma?", FACTS);
  const ai = answerFromModel(payload({ answer_text: "No — nothing called Figma in your workspace.", summary: "No — nothing called Figma in your workspace.", unsupported: true, yes_no: "no" }), ROWS, "/w", "do we use Figma?")!;
  assert.equal(route.pickAnswer(fallback, ai, "do we use Figma?"), ai);
  assert.equal(ai.lean?.headline, "No — nothing called Figma in your workspace");
  assert.equal(route.pickAnswer(fallback, null, "q"), fallback);
});

test("yes (AI filter_records vendor Adobe + yes_no) renders the lean card: 'Yes — Adobe Photoshop'", () => {
  const ai = answerFromModel(payload({ answer_text: "Yes — you use Adobe Photoshop [1].", yes_no: "yes", filters: { vendor: "Adobe" }, citations: [{ n: 1, record_id: "ps", relationship: "" } as never] }), ROWS, "/w", "do we use Adboe?")!;
  assert.equal(ai.records?.yesNo, true);
  const html = render(ai);
  assert.match(html, /data-testid="ask-lean-headline"[^>]*>Yes —/);
  assert.match(html, />Adobe Photoshop<\/a>/);
  assert.match(html, /Vendor from catalogue/);
  assert.match(html, /The AI looked this up with filters/);
});

test("owner: the AI's own headline shows as written; without one, a neutral count (no templated owner phrase)", () => {
  const ai = answerFromModel(payload({ answer_text: "Christine Wong owns 2 Applications.", headline: "Christine Wong owns 2 apps", filters: { owner_person: "Christine" } }), ROWS, "/w", "what is owned by Christine?")!;
  assert.match(render(ai), /data-testid="ask-lean-headline"[^>]*>Christine Wong owns 2 apps</);
  const plain = answerFromModel(payload({ answer_text: "Christine Wong owns 2 Applications.", filters: { owner_person: "Christine" } }), ROWS, "/w", "what is owned by Christine?")!;
  const html = render(plain);
  assert.match(html, /data-testid="ask-lean-headline"[^>]*>2 items</);
  assert.doesNotMatch(html, /owned by/);
});

test("names are hints: typos and first names resolve to workspace names", () => {
  const hints = nameHints("do we use Adboe? what does christine own", FACTS);
  assert.ok(hints.some((h) => h.text === "adboe" && h.name === "Adobe" && h.kind === "vendor" && h.how === "typo"), JSON.stringify(hints));
  assert.ok(hints.some((h) => h.name === "Christine Wong" && h.kind === "person" && h.how === "partial"));
  assert.deepEqual(nameHints("what renews next month?", FACTS), []);
});

test("fallback (AI unavailable / over quota): name matches + reason, no intent parsing", () => {
  const a = nameMatchAnswer("do we use Adboe?", FACTS);
  assert.deepEqual(a.citations.map((c) => c.row.name), ["Adobe Photoshop"]);
  assert.match(fallbackSub(a.nameMatches), /Showing 1 name match from your workspace instead \(adboe → Adobe\)/);
  assert.equal(nameMatchAnswer("what renews next month?", FACTS).citations.length, 0);
  assert.match(fallbackSub(nameMatchAnswer("what renews next month?", FACTS).nameMatches), /No names in this workspace match/);
  assert.equal(aiFallbackNote("model_unavailable", false)?.blocked, true);
  assert.match(aiFallbackNote("round_budget", false)!.title, /couldn't finish/);
  assert.match(aiFallbackNote("something_new", false)!.title, /unavailable/);
  assert.match(aiFallbackNote("max_tokens", false)!.title, /came back empty/);
  assert.match(aiFallbackNote("ungrounded_number", false)!.title, /didn't pass the check/);
  assert.match(aiFallbackNote("timeout", false)!.title, /took too long/);
  assert.match(aiFallbackNote("blocked", false)!.title, /declined/);
  assert.equal(requestError(Object.assign(new Error("Gateway Timeout"), { status: 504 })), "HTTP 504 Gateway Timeout");
});

test("suggestion pills are structured filters run locally (never a typed question, never the quota)", () => {
  const screen = readFileSync("components/mvp/AskScreen.tsx", "utf8");
  const records = readFileSync("components/mvp/AskRecords.tsx", "utf8");
  assert.match(screen, /onPick=\{\(filters\) => setEdited\(\{ question, filters \}\)\}/);
  assert.doesNotMatch(screen, /Ask next/);
  assert.doesNotMatch(screen, /followUpsFor\(/);
  assert.match(records, /onClick: \(\) => onFilters\(\{ \.\.\.filters, \.\.\.item\.add \}\)/);
  assert.doesNotMatch(screen, /I can't answer that yet/);
});
