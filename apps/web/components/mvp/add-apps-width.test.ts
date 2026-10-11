import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const setup = readFileSync(new URL("./setup-flow.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("./ModelScreen.tsx", import.meta.url), "utf8");

test("Model empty state widens its card to max-w-3xl when the add-apps wizard is open", () => {
  const card = readFileSync(new URL("./SetupProgressCard.tsx", import.meta.url), "utf8");
  assert.match(card, /\$\{open \? "max-w-3xl" : "max-w-md"\}/);
  assert.match(model, /<SetupProgressCard/);
  // No scroll/clip container around it (that clipped the wizard; see model-empty-state.test.ts).
  assert.doesNotMatch(model, /overflow-y-auto px-3 pb-6 pt-16/);
});

test("step indicator stays on one row and scrolls horizontally when narrow", () => {
  const stepper = setup.slice(setup.indexOf("function Stepper"));
  assert.match(stepper, /overflow-x-auto whitespace-nowrap/);
  assert.doesNotMatch(stepper.slice(0, 600), /flex-wrap/);
  assert.match(stepper, /"shrink-0 "/);
});

test("results: fixed cost/status columns, truncation with tooltips, unclipped badges, cards on mobile", () => {
  assert.match(setup, /RESULT_COLS = "sm:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.1fr\)_minmax\(0,1\.6fr\)_5\.5rem_4\.75rem\]"/);
  assert.match(setup, /title=\{typed\} className="[^"]*truncate/);
  assert.match(setup, /title=\{think\} className="[^"]*truncate/);
  assert.match(setup, /inline-flex whitespace-nowrap rounded-full[^"]*\$\{badge\.className\}/);
  assert.match(setup, /rounded-xl border border-\[#eef0f4\] p-3 sm:items-start sm:rounded-none/);
  assert.doesNotMatch(setup.slice(setup.indexOf("We found {drafts.length}"), setup.indexOf("Skip for now", setup.indexOf("We found {drafts.length}"))), /overflow-hidden|table-fixed/);
});
