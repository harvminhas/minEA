/** Ask step 1b: fixes from the live tunnel test of step 1. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromRecords, type AskAnswer } from "./deterministic.ts";
import { followUpsFor, pickAnswer, shouldAskModel, stepKey, type ModelGate } from "./route.ts";

const EMPTY_LANDSCAPE = { objects: [], relationships: [] };
const local = (question: string): AskAnswer =>
  answerFromRecords({ question, rows: [], graph: { nodes: [], edges: [] }, basePath: "/orgs/o/workspaces/w", landscape: EMPTY_LANDSCAPE });

function stub(handler: AskAnswer["handler"], citations = 0): AskAnswer {
  return {
    handler,
    answerText: handler,
    citations: Array.from({ length: citations }, (_, n) => ({ n, recordId: `r${n}`, relationship: "", row: {} as never })),
    gaps: [],
    followUps: [],
    caption: { generatedAt: "", recordCount: 0, gapCount: 0 },
  };
}

const STEPS = [
  { id: "estate", status: "done" as const, label: "Read your estate: no applications or infrastructure recorded yet" },
  { id: "tool-1", status: "done" as const, label: "Grouped nothing by vendor: 0 vendors" },
  { id: "check-1", status: "done" as const, label: "Checked every name and number against the lookups" },
];

test("empty estate: no-owner and no-vendor say nothing is recorded, not 'every item has'", () => {
  for (const question of ["What has no owner?", "What has no vendor?", "Which apps have no vendor?"]) {
    const answer = local(question);
    assert.doesNotMatch(answer.answerText, /^Every /, question);
    assert.match(answer.answerText, /recorded yet, so there's nothing to check\./, question);
  }
  assert.equal(local("What has no owner?").answerText, "No applications or infrastructure are recorded yet, so there's nothing to check.");
});

test("'Ask next' never offers the question just asked", () => {
  const chips = followUpsFor(["What has no owner?", "Where is our money going?", "where is our money going?", "What renews in the next 90 days?"], "what has no owner");
  assert.deepEqual(chips, ["Where is our money going?", "What renews in the next 90 days?"]);
  const answer = local("What has no owner?");
  assert.ok(!followUpsFor(answer.followUps, "What has no owner?").some((chip) => /^what has no owner\??$/i.test(chip)));
});

test("an empty estate never calls the model", () => {
  const question = "Which vendors do we spend the most with?";
  const gate: ModelGate = { mode: "answer", question, showingAdd: false, ambiguous: false, hasWorkspace: true, catalogSettled: true, local: local(question) };
  assert.equal(shouldAskModel(gate), true);
  assert.equal(shouldAskModel({ ...gate, estateEmpty: true }), false);
});

test("when the local answer wins after a model call, its real lookups are still shown (minus the check lines)", () => {
  const shown = pickAnswer(stub("vendors"), stub("vendors", 0), "Which vendors do we spend the most with?", STEPS);
  assert.equal(shown.handler, "vendors");
  assert.deepEqual(shown.steps?.map((s) => s.id), ["estate", "tool-1"]);
  assert.equal(pickAnswer(stub("vendors"), null, "q", undefined).steps, undefined);
  // A model answer that wins keeps its own steps (set by answerFromModel), untouched here.
  const model = { ...stub("vendors", 2), steps: STEPS };
  assert.equal(pickAnswer(stub("vendors"), model, "q", STEPS), model);
});

test("step keys are unique even if ids repeat", () => {
  const keys = [{ id: "check" }, { id: "check" }].map(stepKey);
  assert.equal(new Set(keys).size, 2);
  assert.match(readFileSync(new URL("../../components/mvp/AskSteps.tsx", import.meta.url), "utf8"), /key=\{stepKey\(step, index\)\}/);
});

test("Ask → with the same question re-runs it instead of a no-op push", () => {
  const src = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /q === question && !nextFocusId/);
  assert.match(src, /remote\.refetch\(\)/);
});

test("Load sample company fills the box and shows the matches (saves nothing)", () => {
  const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("const loadSample"), src.indexOf("const openReadyMap"));
  assert.match(body, /setText\(SAMPLE_COMPANY\)/);
  assert.match(body, /setStep\(1\)/);
  assert.doesNotMatch(body, /Api\.|fetch\(/);
  assert.equal((src.match(/onClick=\{loadSample\}/g) ?? []).length, 2);
});
