import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { impactGate, NEEDS_HOST_COPY, showExampleEstate } from "./opening";
import { setupState } from "@/lib/setup/setupMin";

test("7 cloud apps meet setup but have no host link: name the real step, not 'Setting up your map'", () => {
  const apps = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, type: "application", properties: { hosting_model: "saas" } }));
  const state = setupState(apps, []);
  assert.equal(state.met, true);
  const example = !state.met || showExampleEstate(0, false, false);
  assert.equal(impactGate(!state.met, example), "needs-host");
  assert.match(NEEDS_HOST_COPY.body, /server or platform/);
  assert.equal(impactGate(false, showExampleEstate(1, false, false)), null);
  assert.equal(impactGate(true, true), "setup");
});

test("the setup progress card on Impact renders only while the minimum is unmet", () => {
  const src = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  const block = src.slice(src.indexOf('impactGate(opening.blocked, opening.example) === "setup"'));
  assert.equal((block.slice(0, block.indexOf("pickerChoices")).match(/<SetupProgressCard/g) ?? []).length, 1);
  assert.match(block, /impact-needs-host/);
  assert.doesNotMatch(block.slice(0, block.indexOf("pickerChoices")), /Open Hosting & location/);
});
