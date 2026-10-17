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
  assert.match(stepper, /className="flex shrink-0 items-center gap-1\.5"/);
});

test("results: the wizard shows the shared add cards, not its own results table", () => {
  assert.match(setup, /<AppAddPanel/);
  assert.doesNotMatch(setup, /RESULT_COLS|We found \{drafts\.length\}/);
});
