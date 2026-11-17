import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { architectureItems, visibleArchitectureItems } from "./architecture-nav.ts";
import { capabilityMapPath, domainDetailPath, isNoDomain, NO_DOMAIN_ID } from "./capability-map-paths.ts";
import { capabilityViewFrom } from "./capabilities.ts";

const B = "/orgs/o/workspaces/w";
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one 'Capability map' item, default, highlighted on domain pages; no classic item under Advanced", () => {
  const items = architectureItems(B);
  const maps = items.filter((item) => /capabilit/i.test(item.label) && !/heatmap/i.test(item.label));
  assert.deepEqual(maps.map((item) => [item.label, item.href, item.advanced]), [["Capability map", `${B}/model/capabilities`, false]]);
  assert.ok(maps[0]!.match.includes("/business/capabilities"));
  assert.ok(!visibleArchitectureItems(items, true).some((item) => /classic/i.test(item.label)));
});

test("Map is the default view, List the secondary one", () => {
  assert.equal(capabilityViewFrom(""), "map");
  assert.equal(capabilityViewFrom("?view=list"), "list");
  const section = src("components/mvp/CapabilitiesSection.tsx");
  assert.match(section, /capability-view-\$\{item\}/);
  assert.match(section, /<CapabilityHeatMap\b/);
  assert.match(section, /<CapabilityExecutiveView\b/);
  assert.match(section, /workspace === "architect" && view === "map"/);
  assert.match(section, /CapabilityInterview/);
  assert.match(section, /onAddYourself/);
  const interview = src("components/capability-map/CapabilityInterview.tsx");
  assert.match(interview, /Or add one capability yourself/);
  assert.match(section, /Edit structure/);
  const review = src("components/capability-map/CapabilityReview.tsx");
  assert.match(review, /Use this map/);
  assert.match(review, /Try again/);
  assert.match(review, /Your domains/);
  assert.match(review, /preview-add-domain/);
  assert.match(review, /preview-add-activity-btn/);
  assert.match(review, /preview-add-capability/);
  assert.doesNotMatch(review, /Accept all/);
  assert.doesNotMatch(section, /Start from a template/);
});

test("the No domain card has no page or domain actions; real domains open their page", () => {
  assert.equal(isNoDomain(NO_DOMAIN_ID), true);
  assert.equal(domainDetailPath("o", "w", NO_DOMAIN_ID), null);
  assert.equal(domainDetailPath("o", "w", "d1"), `${B}/business/capabilities/domains/d1`);
  assert.equal(capabilityMapPath("o", "w"), `${B}/model/capabilities`);
});

test("/business/capabilities redirects to the merged page; domain pages still render", () => {
  assert.match(src("app/orgs/[orgSlug]/workspaces/[workspaceSlug]/[layer]/[type]/page.tsx"), /<CapabilityMapRedirect \/>/);
  assert.match(src("components/capability-map/CapabilityMapRedirect.tsx"), /router\.replace\(target\)/);
  assert.match(src("components/capability-map/DomainDetailPage.tsx"), /capabilityMapPath\(orgSlug, workspaceSlug\)/);
  assert.match(src("components/capability-map/CapabilityMapView.tsx"), /data-testid="map-capability"/);
});

test("domain section counts say capability or capabilities, not capacities", () => {
  const heat = src("components/capability-map/CapabilityHeatMap.tsx");
  assert.match(heat, /1 \? "capability" : "capabilities"/);
  assert.doesNotMatch(heat, /capacit\{/);
  assert.doesNotMatch(heat, /capacities/);
  const exec = src("components/capability-map/CapabilityExecutiveView.tsx");
  assert.doesNotMatch(exec, /capacit\{/);
  assert.doesNotMatch(exec, /capacities/);
  assert.match(exec, /of \{rollup\.total\} assessed/);
});

test("Capability map header counts L2 capabilities, not activities", () => {
  const section = src("components/mvp/CapabilitiesSection.tsx");
  assert.match(section, /l2Capabilities\(/);
  assert.match(section, /data-testid="capability-map-count"/);
  assert.doesNotMatch(section, /Capability map[\s\S]{0,120}\{rows\.length\}/);
  const heat = src("components/capability-map/CapabilityHeatMap.tsx");
  assert.match(heat, /flatten\(tree, "l2"\)\.length/);
  assert.doesNotMatch(heat, /rows\.length/);
  const sidebar = src("components/mvp/ModelSidebar.tsx");
  assert.match(sidebar, /l2Capabilities\(/);
  assert.doesNotMatch(sidebar, /capabilities: countTypes\(\["capability"\]\)/);
});
