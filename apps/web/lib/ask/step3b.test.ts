/** Ask step 3b: fixes from the live test of step 3. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromModel, answerFromRecords } from "./deterministic.ts";
import { latestOnly, revealText, revealTokens } from "./reveal.ts";
import { askWithStream } from "./stream.ts";
import { localOnly } from "./route.ts";
import { rowFromObject } from "../model-catalog.ts";

const src = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
const obj = (id: string, type: string, name: string, properties: Record<string, unknown>) => ({ id, type, name, properties }) as never;
const ROWS = [
  obj("1", "application", "Salesforce", { vendor: "Salesforce", annual_cost: 18000, owner_team: "Sales" }),
  obj("2", "application", "QuickBooks Online", { vendor: "Intuit", annual_cost: 900 }),
  obj("3", "application", "Old CRM", { vendor: "Salesforce", annual_cost: 2000, lifecycle: "retiring", owner_team: "Sales" }),
  obj("5", "application", "SPS Commerce", { vendor: "SPS Commerce" }),
].map(rowFromObject).filter(Boolean) as never[];
const records = (question: string) => answerFromRecords({ question, rows: ROWS, graph: { nodes: [], edges: [] }, basePath: "/b", landscape: { objects: [], relationships: [] } });

test("1. only the latest question's result renders: a late result for an earlier question is dropped", () => {
  const late = { question: "Which vendors do we spend the most with?", payload: {} };
  assert.equal(latestOnly(late, "Where is our money going?"), null);
  assert.equal(latestOnly(late, "Which vendors do we spend the most with?"), late);
  assert.match(src, /latestOnly\(remote\.data, question\)/);
  assert.match(src, /queryFn: askQueryFn\(question, async \(asked, signal\)/); // react-query aborts the old stream (step 4: via askQueryFn)
  assert.match(src, /signal,\s*\n\s*context,\s*\n\s*onStep/);
  // The question is owned by component state; a stale URL can't flip it back.
  assert.match(src, /pendingUrl\.current = q;\s*\n\s*setAsked\(q\);\s*\n\s*window\.history\.pushState/);
});

test("1. an aborted stream does not fall back to a second request", async () => {
  const controller = new AbortController();
  let fellBack = false;
  const pending = askWithStream({
    url: "x", token: "t", question: "q", signal: controller.signal,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    fallback: async () => { fellBack = true; return {} as never; },
  });
  controller.abort();
  await assert.rejects(pending);
  assert.equal(fellBack, false);
});

test("2. the answer card reveals text word by word, closing bold, then shows everything", () => {
  const text = "**You spend $34,248 a year** across 6 vendors.";
  assert.equal(revealTokens(text).length, 8);
  assert.equal(revealText(text, 2), "**You spend**");
  assert.equal(revealText(text, 99), text);
  assert.match(src, /<SummaryAndRest text=\{shownText\}/);
  assert.match(src, /\{!revealing && answer\.chart/);
});

test("5. 'What can we cancel?' is answered from the records, never by a vague model line", () => {
  const answer = records("What can we cancel?");
  assert.equal(answer.handler, "cancel");
  assert.equal(localOnly(answer, "What can we cancel?"), true);
  const byName = Object.fromEntries((answer.table?.rows ?? []).map((row) => [row.label, row.detail]));
  assert.match(byName["Old CRM"], /marked Retiring/);
  assert.match(byName["Old CRM"], /another paid Salesforce tool/);
  assert.match(byName["QuickBooks Online"], /no owner/);
  assert.equal(byName["SPS Commerce"], undefined); // no cost: nothing to cancel
  assert.match(answer.answerText, /3 paid items are worth reviewing/);
});

test("4. table rows: vendor rows open the vendor record, the whole row is clickable", () => {
  assert.match(src, /if \(kind === "vendors"\) return modelItemPath\(basePath, "vendors", target\.label\)/);
  const rich = readFileSync(new URL("../../components/mvp/AskRich.tsx", import.meta.url), "utf8");
  assert.match(rich, /onClick=\{\(\) => href && onOpen\(href\)\}/);
});

test("6. repeated fix actions from the model render once (they shared a React key)", () => {
  const payload = {
    source: "llm", fallback_reason: null, answer_text: "Salesforce [1] has no owner.", gaps: [], follow_ups: ["x"], tools_used: [],
    citations: [{ n: 1, record_id: "1", name: "Salesforce", type_label: "Application", kind: "", owner: "", criticality: "", relationship: "" }],
    fix_actions: [{ record_id: "1", field: "owner", suggested_value: "Sales" }, { record_id: "1", field: "owner", suggested_value: "Sales" }],
  } as never;
  assert.equal(answerFromModel(payload, ROWS, "/b", "Who should own Salesforce?")!.fixActions?.length, 1);
});

test("6. the dev probe pulls the key out of React's warning", async () => {
  const { duplicateKeyFrom } = await import("../dev/duplicate-key-probe.ts");
  assert.equal(duplicateKeyFrom(["Encountered two children with the same key, `0-Salesforce`. Keys should be unique"]), "0-Salesforce");
  assert.equal(duplicateKeyFrom(["Warning: Encountered two children with the same key, `%s`.", "abc"]), "abc");
  assert.equal(duplicateKeyFrom(["something else"]), null);
});
