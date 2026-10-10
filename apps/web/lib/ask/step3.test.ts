/** Ask step 3: rich answers, plus the two step-2b live-test leftovers. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromModel, answerFromRecords } from "./deterministic.ts";
import { renewalBlocks, splitSummary, vendorBlocks } from "./rich.ts";
import { followUpsFor } from "./route.ts";
import { readAskStream } from "./stream.ts";
import { rowFromObject } from "../model-catalog.ts";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown>) => ({ id, type, name, properties }) as never;
const ROWS = [
  obj("1", "application", "Salesforce", { vendor: "Salesforce", annual_cost: 18000 }),
  obj("2", "application", "QuickBooks Online", { vendor: "Intuit", annual_cost: 900 }),
  obj("3", "application", "Microsoft 365", { vendor: "Microsoft", annual_cost: 15000 }),
  obj("4", "application", "Order Entry", { cost_model: "built_ourselves" }),
  obj("5", "application", "SPS Commerce", { vendor: "SPS Commerce" }),
  obj("6", "application", "Shopify", { vendor: "Shopify", annual_cost: 348 }),
  obj("7", "application", "BarTender", { vendor: "Seagull" }),
  obj("8", "model", "AS400", {}),
].map(rowFromObject).filter(Boolean) as never[];

const TABLE_ROWS = [
  ["Salesforce", "$18,000 a year", "Salesforce", "1"], ["Microsoft", "$15,000 a year", "Microsoft 365", "3"], ["Intuit", "$900 a year", "QuickBooks Online", "2"],
  ["Shopify", "$348 a year", "Shopify", "6"], ["Seagull", "No annual cost recorded", "BarTender", "7"], ["SPS Commerce", "No annual cost recorded", "SPS Commerce", "5"],
].map(([label, value, detail, record_id]) => ({ label, value, detail, record_id }));

const PAYLOAD = {
  source: "llm", fallback_reason: null, answer_text: "You use 6 vendors. Salesforce [1] is the largest.", summary: "You use 6 vendors.",
  citations: [{ n: 1, record_id: "1", name: "Salesforce", type_label: "Application", kind: "", owner: "", criticality: "", relationship: "" }],
  evidence: [{ text: "Salesforce", citation_ids: ["1"] }, { text: "Microsoft", citation_ids: ["3"] }, { text: "Intuit", citation_ids: ["2"] }],
  gaps: [], follow_ups: ["Which vendors do we spend the most with?"], tools_used: ["aggregate"],
  table: { kind: "vendors", columns: ["Vendor", "Spend", "Applications and infrastructure"], rows: TABLE_ROWS },
  chart: { kind: "bar", title: "Spend by vendor", unit: "usd", bars: [{ label: "Salesforce", value: 18000 }, { label: "Microsoft", value: 15000 }] },
} as never;

const records = (question: string) => answerFromRecords({ question, rows: ROWS, graph: { nodes: [], edges: [] }, basePath: "/b", landscape: { objects: [], relationships: [] } });

test("(ii) model vendor answer keeps the server table of all 6 vendors even when it also sends evidence", () => {
  const answer = answerFromModel(PAYLOAD, ROWS, "/b", "Which vendors do we spend the most with?")!;
  assert.equal(answer.handler, "vendors");
  assert.equal(answer.table?.rows.length, 6);
  assert.deepEqual(answer.table?.rows[4], { label: "Seagull", value: "No annual cost recorded", detail: "BarTender", recordId: "7" });
  assert.equal(answer.chart?.bars.length, 2);
  const src = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /\{answer\.table && \(\s*<AskRichTable/); // not gated on evidence, unlike the citations table
});

test("browser answers use the same table and chart shapes", () => {
  const vendors = records("Where is our money going?");
  assert.deepEqual(vendors.table, vendorBlocks(ROWS).table);
  assert.equal(vendors.table?.rows.length, 6);
  assert.deepEqual(vendors.chart?.bars.map((b) => b.label), ["Salesforce", "Microsoft", "Intuit", "Shopify"]);
  const soon = new Date(Date.now() + 10 * 864e5);
  const renewing = rowFromObject(obj("9", "application", "Zoom", { vendor: "Zoom", annual_cost: 1200, contract_renewal: soon.toISOString().slice(0, 10) }))!;
  const blocks = renewalBlocks([renewing]);
  assert.equal(blocks.table?.kind, "renewals");
  assert.match(blocks.table!.rows[0].detail, /renews/);
  assert.equal(blocks.chart?.bars[0].value, 1200);
});

test("summary line is the first sentence", () => {
  assert.deepEqual(splitSummary("**3 contracts renew**, worth $1.5 million. Salesforce is first."), { summary: "**3 contracts renew**, worth $1.5 million.", rest: "Salesforce is first." });
  assert.deepEqual(splitSummary("No sentence end"), { summary: "No sentence end", rest: "" });
});

test("three follow-up chips, never the current question", () => {
  const chips = followUpsFor(["Which vendors do we spend the most with?"], "Which vendors do we spend the most with?");
  assert.equal(chips.length, 3);
  assert.ok(!chips.some((c) => /which vendors/i.test(c)));
});

test("(i) text is revealed word by word with pauses, so coalesced chunks still paint separately", async () => {
  const body = 'event: delta\ndata: {"text":"one two three "}\n\nevent: delta\ndata: {"text":"four five"}\n\nevent: final\ndata: {"source":"llm","answer_text":"one two three four five","citations":[],"gaps":[],"follow_ups":[],"tools_used":[]}\n\nevent: done\ndata: {}\n\n';
  const seen: string[] = [];
  const started = Date.now();
  const final = await readAskStream(new Response(body), { onText: (t) => seen.push(t), revealMs: 10 });
  assert.deepEqual(seen, ["one ", "one two ", "one two three ", "one two three four ", "one two three four five"]);
  assert.ok(Date.now() - started >= 40);
  assert.equal(final.answer_text, "one two three four five");
});
