import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setupCardHeader } from "./setupMin.ts";

test("Example data only while the wizard is closed and there are 0 real apps", () => {
  assert.deepEqual(setupCardHeader({ apps: 0, located: 0 }, false), { mode: "example" });
  assert.equal(setupCardHeader({ apps: 0, located: 0 }, true).mode, "progress");
  assert.equal(setupCardHeader({ apps: 1, located: 0 }, false).mode, "progress");
});

test("progress header: counts, bar percent and the 'saved' line", () => {
  const h = setupCardHeader({ apps: 4, located: 0 }, true);
  assert.equal(h.mode, "progress");
  if (h.mode !== "progress") return;
  assert.equal(h.title, "Setting up your map");
  assert.equal(h.progressLine, "Add at least 5 apps · 4 so far");
  assert.doesNotMatch(h.progressLine, /of 1|✓/);
  assert.equal(h.percent, 40);
  assert.equal(h.onlyLink, false);
  assert.equal(h.savedLine, "Your entries are saved to your workspace. Reports unlock once you have 5 apps and say where one of them runs.");
  assert.doesNotMatch(h.savedLine, /sample|nothing here is saved/i);
  const full = setupCardHeader({ apps: 9, located: 3 }, false);
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

test("apps met, link missing: clamped count, 'Last step' copy, bar at 50% (never past 100)", () => {
  const h = setupCardHeader({ apps: 6, located: 0 }, false);
  assert.equal(h.mode, "progress");
  if (h.mode !== "progress") return;
  assert.equal(h.onlyLink, true);
  assert.equal(h.title, "Last step: tell us where one app runs");
  assert.equal(h.progressLine, "6 apps ✓ · Say where one app runs");
  assert.doesNotMatch(h.progressLine, /6 of 5/);
  assert.equal(h.percent, 50);
  const over = setupCardHeader({ apps: 40, located: 7 }, true);
  assert.ok(over.mode === "progress" && over.percent === 100 && !over.onlyLink);
});

test("the link-only CTA opens the wizard at 'Where each one lives' with saved apps and servers", async () => {
  const card = readFileSync(new URL("../../components/mvp/SetupProgressCard.tsx", import.meta.url), "utf8");
  assert.match(card, /onlyLink \? <SetupFlow inline startAt="where" \/> : <FirstRunAsk inline \/>/);
  const flow = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.match(flow, /startAt !== "where" \|\| seeded/);
  assert.match(flow, /setStep\(3\);\n    setSeeded\(true\)/);
  // after links are saved the catalogue is refetched so the card goes away without a reload
  const link = flow.slice(flow.indexOf("const linkServers"), flow.indexOf("const finish"));
  assert.match(link, /invalidateQueries\(\{ queryKey: catalogQueryKey/);
  assert.match(link, /whereBatch\(planned\.servers, planned\.links, whereApps, existing/);
});

test("Reports no longer latches the card after setup is met", () => {
  const src = readFileSync(new URL("../../components/mvp/ReportsScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /setupLatched/);
  assert.match(src, /\{blocked && \(/);
  assert.match(src, /\{blocked && <SampleCompanyBadge/);
  const views = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  assert.match(views, /\{opening\.example && <SampleCompanyBadge/);
});

test("progress line wording: no 'N of 1', a ✓ only for what is done", () => {
  const line = (apps: number, located: number) => {
    const h = setupCardHeader({ apps, located }, true);
    return h.mode === "progress" ? h.progressLine : "";
  };
  assert.equal(line(0, 0), "Add at least 5 apps · 0 so far");
  assert.equal(line(1, 0), "Add at least 5 apps · 1 so far");
  assert.equal(line(3, 1), "Add at least 5 apps · 3 so far · Location known ✓");
  assert.equal(line(5, 0), "5 apps ✓ · Say where one app runs");
  assert.equal(line(7, 2), "7 apps ✓ · Location known ✓");
  for (const [apps, located] of [[0, 0], [1, 0], [4, 1], [5, 0], [9, 3]]) assert.doesNotMatch(line(apps, located), /\d+ of \d+/);
});
