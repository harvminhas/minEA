import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setupCardHeader } from "./setupMin.ts";

test("Example data only while the wizard is closed and there are 0 real apps", () => {
  assert.deepEqual(setupCardHeader({ apps: 0, hostingLinks: 0 }, false), { mode: "example" });
  assert.equal(setupCardHeader({ apps: 0, hostingLinks: 0 }, true).mode, "progress");
  assert.equal(setupCardHeader({ apps: 1, hostingLinks: 0 }, false).mode, "progress");
});

test("progress header: counts, bar percent and the 'saved' line", () => {
  const h = setupCardHeader({ apps: 4, hostingLinks: 0 }, true);
  assert.equal(h.mode, "progress");
  if (h.mode !== "progress") return;
  assert.equal(h.title, "Setting up your map");
  assert.equal(h.progressLine, "4 of 5 apps · 0 of 1 linked to a server");
  assert.equal(h.percent, 67);
  assert.equal(h.savedLine, "Your entries are saved to your workspace. Reports unlock at 5 apps and 1 server link.");
  assert.doesNotMatch(h.savedLine, /sample|nothing here is saved/i);
  const full = setupCardHeader({ apps: 9, hostingLinks: 3 }, false);
  assert.equal(full.mode === "progress" && full.percent, 100);
});

test("Model, Reports and Views all use the shared card (no copies of the old sample-only header)", () => {
  for (const file of ["ModelScreen", "ReportsScreen", "EstateViews"]) {
    const src = readFileSync(new URL(`../../components/mvp/${file}.tsx`, import.meta.url), "utf8");
    assert.match(src, /<SetupProgressCard/, file);
    assert.doesNotMatch(src, /> Example data<|>Example data</, file);
  }
  const card = readFileSync(new URL("../../components/mvp/SetupProgressCard.tsx", import.meta.url), "utf8");
  assert.match(card, /setupCardHeader\(state, open\)/);
  assert.match(card, /role="progressbar"/);
});
