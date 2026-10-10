/** Ask step 4b: follow-ups that refer back are scoped to the last answer's items; whole-cell row links. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { followUpScope, refersBack } from "./followup.ts";
import { turnFromAnswer } from "./thread.ts";
import { answerFromRecords } from "./deterministic.ts";
import { localOnly } from "./route.ts";
import { rowFromObject } from "../model-catalog.ts";

test("refersBack: those/these/them/they/that one/it, but not 'IT'", () => {
  for (const q of ["Which of those has no owner?", "Do these renew soon?", "Which of them cost most?", "Do they have owners?", "Who owns that one?", "What does it cost?"]) assert.equal(refersBack(q), true, q);
  for (const q of ["What has no owner?", "How big is our IT estate?", "Which vendors do we spend the most with?"]) assert.equal(refersBack(q), false, q);
});

const vendorAnswer = {
  handler: "vendors", answerText: "You use 6 vendors.", citations: [], gaps: [], followUps: [], caption: { generatedAt: "", recordCount: 0, gapCount: 0 },
  table: {
    kind: "vendors", columns: ["Vendor", "Spend", "Applications and infrastructure"],
    rows: [
      { label: "Microsoft", value: "$15,000 a year", detail: "Microsoft 365, Teams", recordId: "m1", items: [{ id: "m1", name: "Microsoft 365" }, { id: "m2", name: "Teams" }] },
      { label: "Seagull", value: "No annual cost recorded", detail: "BarTender", recordId: "b1", items: [{ id: "b1", name: "BarTender" }] },
    ],
  },
} as never;

test("a vendor answer's turn keeps every app under each vendor, and the scope says '2 vendors'", () => {
  const turn = turnFromAnswer("Which vendors do we spend the most with?", vendorAnswer, 1);
  assert.deepEqual(turn.items.map((i) => i.id), ["m1", "m2", "b1"]);
  const scope = followUpScope("Which of those has no owner?", turn)!;
  assert.deepEqual([...scope.ids], ["m1", "m2", "b1"]);
  assert.equal(scope.note, "Looking at the 2 vendors from your last question");
  assert.equal(followUpScope("What has no owner?", turn), null);
  assert.equal(followUpScope("Which of those has no owner?", { ...turn, items: [] }), null);
});

test("'Which of those has no owner?' after the vendor answer leaves out items with no vendor", () => {
  const row = (id: string, name: string, type: string, vendor: string | null) =>
    rowFromObject({ id, type, name, properties: { ...(vendor ? { vendor } : {}), ...(type === "cloud_service" ? { compute_runtime_kind: "on_prem" } : {}) } } as never)!;
  const all = [row("m1", "Microsoft 365", "application", "Microsoft"), row("m2", "Teams", "application", "Microsoft"), row("b1", "BarTender", "application", "Seagull"), row("oe", "Order Entry", "application", null), row("as", "AS400", "cloud_service", null)];
  const scope = followUpScope("Which of those has no owner?", turnFromAnswer("Which vendors?", vendorAnswer, 1))!;
  const scoped = answerFromRecords({ question: "Which of those has no owner?", rows: all.filter((r: { id: string }) => scope.ids.has(r.id)), graph: { nodes: [], edges: [] }, basePath: "/b" } as never);
  assert.equal(localOnly(scoped, "Which of those has no owner?"), true);
  assert.doesNotMatch(scoped.answerText, /Order Entry|AS400|On-prem/);
  assert.match(scoped.answerText, /3 Applications have no owner/);
});

test("AskScreen scopes local follow-ups and shows the note", () => {
  const src = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /followUpScope\(question, earlierTurns\(thread, question\)\.at\(-1\)\)/);
  assert.match(src, /localOnly\(scoped, question\) \? \{ \.\.\.scoped, scopeNote: scope\.note \}/);
  assert.match(src, /data-testid="ask-scope-note"/);
});

test("table cells carry a full-cell link under their content, so empty space opens the row", () => {
  const rich = readFileSync(new URL("../../components/mvp/AskRich.tsx", import.meta.url), "utf8");
  assert.match(rich, /function CellLink/);
  assert.match(rich, /className="absolute inset-0"/);
  assert.equal((rich.match(/<CellLink href=\{href\}/g) ?? []).length, 2);
});
