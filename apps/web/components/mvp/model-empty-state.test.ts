import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync(new URL("./ModelOverview.tsx", import.meta.url), "utf8");
const screen = readFileSync(new URL("./ModelScreen.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("./SetupProgressCard.tsx", import.meta.url), "utf8");

test("Overview no longer uses a dimmed sample-company overlay", () => {
  assert.doesNotMatch(overview, /absolute inset-0/);
  assert.doesNotMatch(overview, /Sample company: 13 applications/);
  assert.doesNotMatch(overview, /pointer-events-none select-none opacity-40/);
});

test("first-run wizard stays available on Overview as a slim notice when setup is not met", () => {
  assert.doesNotMatch(overview, /<SetupProgressCard/);
  assert.match(overview, /<OverviewSetupNotice/);
  assert.match(overview, /data-testid="overview-map-setup"/);
  assert.match(card, /export function OverviewSetupNotice/);
  assert.match(card, /data-testid="overview-setup-notice"/);
  assert.match(card, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
  assert.match(card, /onlyLink \? <SetupFlow inline startAt="where" \/> : <FirstRunAsk inline \/>/);
  assert.match(card, /aria-expanded=\{open\}/);
  assert.match(card, /querySelector\("textarea"\) \?\? card\.current\?\.querySelector<HTMLElement>\("\[data-where-own\]"\)\)\?\.focus\(/);
});

test("the sample-company gate was replaced by in-page map setup; the wizard card is unchanged on Reports and Views", () => {
  assert.doesNotMatch(screen, /<SetupProgressCard/);
  assert.match(overview, /Start with what the business does/);
  assert.doesNotMatch(overview, /Setting up your map/);
  assert.match(card, /Sample company<\/span>\s*Sample data: not your apps/);
});
