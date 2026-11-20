import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("returning to the capability map scrolls the page to the top instead of a domain tile", () => {
  const section = src("components/mvp/CapabilitiesSection.tsx");
  assert.match(section, /scrollAncestorToTop\(rootRef\.current\)/);
  assert.match(section, /\[focusDomainId\]/);
  assert.doesNotMatch(section, /scrollIntoView/);
  const heat = src("components/capability-map/CapabilityHeatMap.tsx");
  assert.doesNotMatch(heat, /scrollIntoView/);
  assert.doesNotMatch(heat, /heat-node-\$\{targetId\}/);
  const helper = src("lib/scroll-ancestor.ts");
  assert.match(helper, /export function scrollAncestorToTop/);
  assert.match(helper, /node\.scrollTop = 0/);
});
