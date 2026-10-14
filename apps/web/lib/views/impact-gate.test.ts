import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { impactGate, NEEDS_HOST_COPY, showExampleEstate } from "./opening";
import { setupState } from "@/lib/setup/setupMin";

test("nothing to analyze: the prompt names the step and its button leads to the per-app picker", () => {
  const apps = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, type: "application", properties: {} }));
  assert.equal(setupState(apps, []).met, false);
  assert.equal(impactGate(false, showExampleEstate(0, false, false)), "needs-host");
  assert.match(NEEDS_HOST_COPY.body, /cloud provider, one of your servers, or people’s computers/);
  assert.equal(impactGate(false, showExampleEstate(1, false, false)), null);
  assert.equal(impactGate(true, true), "setup");
  const src = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  assert.match(src, /tab=hosting#where-each-runs`\} [^>]*>\{NEEDS_HOST_COPY.button\}/);
  assert.match(src, /id="where-each-runs"/);
});

test("the setup progress card on Impact renders only while the minimum is unmet", () => {
  const src = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  const block = src.slice(src.indexOf('impactGate(opening.blocked, opening.example) === "setup"'));
  assert.equal((block.slice(0, block.indexOf("pickerChoices")).match(/<SetupProgressCard/g) ?? []).length, 1);
  assert.match(block, /impact-needs-host/);
  assert.doesNotMatch(block.slice(0, block.indexOf("pickerChoices")), /Open Hosting & location/);
});
