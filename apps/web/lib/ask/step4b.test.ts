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



test("table cells carry a full-cell link under their content, so empty space opens the row", () => {
  const rich = readFileSync(new URL("../../components/mvp/AskRich.tsx", import.meta.url), "utf8");
  assert.match(rich, /function CellLink/);
  assert.match(rich, /className="absolute inset-0"/);
  assert.equal((rich.match(/<CellLink href=\{href\}/g) ?? []).length, 2);
});
