import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { advancedEnabled, architectureItems, hasAdvancedRecords, visibleArchitectureItems } from "./architecture-nav.ts";

const B = "/orgs/o/workspaces/w";
const labels = (advanced: boolean, path = "") => visibleArchitectureItems(architectureItems(B), advanced, path).map((item) => item.label);
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("default Architecture shows the three everyday items", () => {
  assert.deepEqual(labels(false), ["Capability map", "Roadmap & renewals", "Sensitive data"]);
  const items = architectureItems(B);
  assert.equal(items[0]!.href, `${B}/model/capabilities`);
  assert.equal(items[1]!.href, `${B}/strategy/roadmaps`);
  assert.equal(items[2]!.href, `${B}/data/data-objects`);
});

test("Advanced reveals the rest", () => {
  assert.deepEqual(labels(true), [
    "Capability map", "Roadmap & renewals", "Sensitive data",
    "Processes", "Investments", "Classic capability map", "Data stores", "Data domains",
  ]);
});

test("existing records in hidden types turn Advanced on; an explicit choice wins", () => {
  assert.equal(hasAdvancedRecords({}), false);
  assert.equal(hasAdvancedRecords({ processes: 0, dataStores: undefined }), false);
  assert.equal(advancedEnabled(null, { processes: 2 }), true);
  assert.equal(advancedEnabled(undefined, { dataStores: 1 }), true);
  assert.equal(advancedEnabled(undefined, {}), false);
  assert.equal(advancedEnabled(false, { dataDomains: 4 }), false, "turned off on purpose stays off");
  assert.equal(advancedEnabled(true, {}), true);
});

test("Products, Journeys and the heatmap are never listed, even with Advanced on or on their page", () => {
  for (const path of ["", `${B}/views/journeys`, `${B}/strategy/products`, `${B}/views/capability-heatmap`]) {
    for (const advanced of [false, true]) {
      const shown = labels(advanced, path);
      for (const gone of ["Products", "Journeys", "Capability heatmap"]) assert.ok(!shown.includes(gone), `${gone} @ ${path}`);
    }
  }
  const keys = architectureItems(B).map((item) => item.countKey).filter(Boolean);
  assert.deepEqual(keys, ["processes", "dataStores", "dataDomains"], "products/journeys no longer turn Advanced on");
  assert.doesNotMatch(src("components/mvp/ModelSidebar.tsx"), /strategy\/products|views\/journeys/);
});

test("hidden routes still work by direct URL and stay highlighted", () => {
  assert.ok(labels(false, `${B}/views/investments`).includes("Investments"));
  assert.ok(!labels(false, `${B}/views/investments`).includes("Processes"));
  for (const page of ["views/processes", "views/journeys", "views/investments", "views/capability-heatmap", "views/products", "strategy/products"]) {
    readFileSync(new URL(`../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/${page}/page.tsx`, import.meta.url));
  }
});

test("pages are renamed and fintech examples are gone", () => {
  assert.match(src("components/strategy/RoadmapList.tsx"), /Roadmap &amp; renewals/);
  assert.match(src("components/data/SensitiveDataPage.tsx"), />Sensitive data</);
  const files = [
    "lib/views.ts", "components/views/ProcessBuilder.tsx", "components/views/ProductForm.tsx", "components/views/StageDetailPanel.tsx",
    "components/views/JourneyBuilder.tsx", "components/views/JourneyEdgeAnnotationPopover.tsx", "components/views/EdgeAnnotationPopover.tsx",
    "components/strategy/RoadmapTimeline.tsx", "components/strategy/RoadmapTrackSegmentDrawer.tsx", "components/data/CreateDataPanel.tsx", "components/data/DomainDetailPanel.tsx",
  ];
  for (const file of files) assert.doesNotMatch(src(file), /merchant|dispute resolution|KYC|Partner Sourcing|Payments team|like Payments|e\.g\. Payments/i, file);
});

test("the sidebar uses the shared list and the per-workspace toggle", () => {
  const sidebar = src("components/mvp/ModelSidebar.tsx");
  assert.match(sidebar, /visibleArchitectureItems\(architectureItems\(basePath\), arch\.advanced, pathname\)/);
  assert.match(sidebar, /data-testid="arch-advanced-toggle"/);
  assert.match(src("lib/use-architecture-advanced.ts"), /workspaceSettingsApi\.save/);
});
