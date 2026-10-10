/** Ask step 2b: fixes from the live tunnel test of step 2. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromModel, answerFromRecords } from "./deterministic.ts";
import { pickAnswer } from "./route.ts";
import { catalogStats, rowFromObject } from "../model-catalog.ts";

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

const TABLE = [
  ["Salesforce", 18000, ["1"], ["Salesforce"]], ["Microsoft", 15000, ["3"], ["Microsoft 365"]], ["Intuit", 900, ["2"], ["QuickBooks Online"]],
  ["Shopify", 348, ["6"], ["Shopify"]], ["Seagull", null, ["7"], ["BarTender"]], ["SPS Commerce", null, ["5"], ["SPS Commerce"]],
].map(([vendor, annual_cost, record_ids, names]) => ({ vendor, annual_cost, share_pct: null, record_ids, names })) as never;

const PAYLOAD = {
  source: "llm", fallback_reason: null, answer_text: "You use 6 vendors. Salesforce [1] is the largest.", citations: [{ n: 1, record_id: "1", name: "Salesforce", type_label: "Application", kind: "", owner: "", criticality: "", relationship: "" }],
  gaps: [], follow_ups: ["x"], tools_used: ["aggregate"], vendor_table: TABLE,
} as never;

test("header counts 6 vendors for the sample: SPS Commerce and Seagull count, Order Entry and the AS400 add none", () => {
  assert.equal(catalogStats(ROWS).vendorCount, 6);
});

test("model vendor answer: one row per vendor with vendor names, all 6, top vendor kept, no stray markers", () => {
  const answer = answerFromModel(PAYLOAD, ROWS, "/b", "Which vendors do we spend the most with?")!;
  assert.equal(answer.handler, "vendors");
  assert.deepEqual(answer.citations.map((c) => c.displayName), ["Salesforce", "Microsoft", "Intuit", "Shopify", "Seagull", "SPS Commerce"]);
  assert.ok(answer.citations.every((c) => c.displayType === "Vendor"));
  assert.match(answer.citations[4].relationship, /No annual cost recorded · BarTender/);
  assert.equal(answer.citations[0].row.ownerTeam, "");
  assert.doesNotMatch(answer.answerText, /\[\d+\]/);
  // It wins over the browser's answer now (it has rows), so the streamed text is what stays on screen.
  const local = answerFromRecords({ question: "Which vendors do we spend the most with?", rows: ROWS, graph: { nodes: [], edges: [] }, basePath: "/b", landscape: { objects: [], relationships: [] } });
  assert.equal(pickAnswer(local, answer, "Which vendors do we spend the most with?"), answer);
});

test("browser spend answer: every vendor is a row and the stated count equals the rows", () => {
  const answer = answerFromRecords({ question: "Where is our money going?", rows: ROWS, graph: { nodes: [], edges: [] }, basePath: "/b", landscape: { objects: [], relationships: [] } });
  const vendorRows = answer.citations.filter((c) => c.displayType === "Vendor");
  assert.equal(vendorRows.length, 6);
  assert.match(answer.answerText, /across 6 vendors \(2 with no cost recorded\)/);
  assert.ok(vendorRows.some((c) => c.displayName === "Shopify"));
});

test("home: the working state shows the moment Ask is pressed; report cards show loading, not false empties", () => {
  const src = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(mode === "home"\) setPendingQuestion\(q\)/);
  assert.match(src, /mode === "home" && pendingQuestion/);
  assert.match(src, /router\.prefetch\(askPath\(basePath/);
  assert.match(src, /const estateLoading = !catalog\.data;/);
  assert.equal((src.match(/estateLoading \? "…" : cards\./g) ?? []).length, 4);
  assert.match(src, /Model health: loading…/);
});
