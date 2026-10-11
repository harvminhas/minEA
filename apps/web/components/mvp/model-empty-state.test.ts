import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./ModelScreen.tsx", import.meta.url), "utf8");
const overview = src.slice(src.indexOf("function Overview("), src.indexOf("function ConnectionsList"));

test("example card is in normal flow: never an absolute inset-0 overlay that clips the opened wizard", () => {
  assert.doesNotMatch(overview, /absolute inset-0/);
  assert.match(overview, /relative z-10 -mt-24 flex justify-center/);
});

test("Add apps here toggles to Close and focuses the paste box on open", () => {
  assert.match(overview, /onClick=\{\(\) => setAddApps\(\(open\) => !open\)\}/);
  assert.match(overview, /\{addApps \? "Close" : "Add apps here"\}/);
  assert.match(overview, /aria-expanded=\{addApps\}/);
  assert.match(overview, /querySelector\("textarea"\)[\s\S]*focus\(/);
});

test("one example card only, and the sample stats are labelled as sample data", () => {
  assert.equal((src.match(/data-testid="example-card"/g) ?? []).length, 1);
  assert.match(overview, /Sample company<\/span>\s*Sample data: not your apps/);
  assert.match(overview, /"Sample company: 13 applications, 6 platforms, 11 servers\."/);
});
