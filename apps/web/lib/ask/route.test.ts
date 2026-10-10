/** Ask step 1: local-or-model is decided before any model call (no more wasted Gemini calls). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromRecords, type AskAnswer } from "./deterministic.ts";
import { LOCAL_ONLY_HANDLERS, localOnly, pickAnswer, shouldAskModel, workingLine, type ModelGate } from "./route.ts";

const EMPTY_LANDSCAPE = { objects: [], relationships: [] };

function local(question: string): AskAnswer {
  return answerFromRecords({ question, rows: [], graph: { nodes: [], edges: [] }, basePath: "/orgs/o/workspaces/w", landscape: EMPTY_LANDSCAPE });
}

function gate(question: string, extra: Partial<ModelGate> = {}): ModelGate {
  return { mode: "answer", question, showingAdd: false, ambiguous: false, hasWorkspace: true, catalogSettled: true, local: local(question), ...extra };
}

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

test("questions the browser answers itself never call the model", () => {
  for (const question of [
    "What has no owner?",
    "Which applications have no vendor?",
    "What is out of support?",
    "What signs in with Okta?",
    "Which AI can see customer data?",
  ]) {
    const l = local(question);
    assert.equal(shouldAskModel(gate(question)), false, `${question} -> ${l.handler} must stay local`);
    assert.ok(localOnly(l, question), question);
  }
});

test("questions the model answers still call it once", () => {
  for (const question of ["What renews in the next 90 days?", "Where is our money going?", "Which vendors do we pay?", "What is end of life?"]) {
    assert.equal(shouldAskModel(gate(question)), true, `${question} -> ${local(question).handler}`);
  }
});

test("local-only handler set: impact, importance, cost, ownership, gaps, clarify, aging, sign-in, cancel", () => {
  assert.deepEqual([...LOCAL_ONLY_HANDLERS].sort(), ["aging", "cancel", "clarify", "cost", "gaps", "impact", "importance", "ownership", "sign_in"]);
  for (const handler of LOCAL_ONLY_HANDLERS) assert.equal(localOnly(stub(handler), "x"), true);
  for (const handler of ["renewals", "spend", "vendors", "lifecycle", "criticality", "unsupported", "ai"] as const) {
    assert.equal(localOnly(stub(handler), "What AI do we use?"), false, handler);
  }
});

test("no model call before the catalogue settles, for add lists, or without a workspace", () => {
  const q = "What renews in the next 90 days?";
  assert.equal(shouldAskModel(gate(q, { catalogSettled: false })), false);
  assert.equal(shouldAskModel(gate(q, { showingAdd: true })), false);
  assert.equal(shouldAskModel(gate(q, { ambiguous: true })), false);
  assert.equal(shouldAskModel(gate(q, { hasWorkspace: false })), false);
  assert.equal(shouldAskModel(gate(q, { mode: "home" })), false);
  assert.equal(shouldAskModel(gate("", { question: "" })), false);
});

test("pickAnswer keeps today's rules", () => {
  const renewals = stub("renewals");
  const model = stub("renewals", 2);
  assert.equal(pickAnswer(renewals, model, "q"), model);
  assert.equal(pickAnswer(renewals, null, "q"), renewals);
  assert.equal(pickAnswer(renewals, stub("unsupported"), "q"), renewals);
  const vendorsLocal = stub("vendors");
  assert.equal(pickAnswer(vendorsLocal, stub("vendors", 0), "q"), vendorsLocal);
  const gaps = stub("gaps");
  assert.equal(pickAnswer(gaps, model, "q"), gaps);
});

test("working line uses the real estate size", () => {
  assert.equal(workingLine(212), "Looking through 212 items in your estate");
  assert.equal(workingLine(1), "Looking through 1 item in your estate");
  assert.equal(workingLine(0), "Looking through your estate");
  assert.equal(workingLine(1500), "Looking through 1,500 items in your estate");
});

test("the canned three-step ticker is gone from the Ask screen", () => {
  const source = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  for (const canned of ["Reading your question", "Looking up applications, capabilities, and infrastructure", "Checking the answer against those results", "THINKING_STEPS"]) {
    assert.ok(!source.includes(canned), canned);
  }
  assert.match(source, /enabled: askModel/);
});
