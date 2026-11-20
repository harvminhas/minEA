import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("domain Gaps lists the first 3 items and a Show N more control, and keeps View all", () => {
  const overview = src("components/capability-map/DomainOverviewTab.tsx");
  assert.match(overview, /title="Gaps"/);
  assert.match(overview, /label="View all"/);
  assert.match(overview, /gapsExpanded \? gaps : gaps\.slice\(0, 3\)/);
  assert.match(overview, /Show \$\{gaps\.length - 3\} more/);
  assert.match(overview, /Show less/);
  assert.match(overview, /data-testid="gaps-show-more"/);
});
