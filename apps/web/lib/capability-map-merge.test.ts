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
  assert.match(section, /<CapabilityHeatMap /);
  assert.match(section, /CapabilityInterview/);
  assert.match(section, /onAddYourself/);
  const interview = src("components/capability-map/CapabilityInterview.tsx");
  assert.match(interview, /Or add one capability yourself/);
  assert.match(section, /Edit structure/);
  const review = src("components/capability-map/CapabilityReview.tsx");
  assert.match(review, /Use this map/);
  assert.match(review, /Try again/);
  assert.match(review, /preview-add-activity-btn/);
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
