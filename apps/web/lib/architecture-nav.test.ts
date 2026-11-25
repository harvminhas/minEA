import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  advancedEnabled,
  hasAdvancedRecords,
  modelNavGroups,
  platformsCloudCount,
  visibleModelNavGroups,
} from "./architecture-nav.ts";

const B = "/orgs/o/workspaces/w";
const labels = (advanced: boolean, path = "") =>
  visibleModelNavGroups(modelNavGroups(B), advanced, path).flatMap((group) => group.items.map((item) => item.label));
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Overview sits alone, then Business, Technology, Organisation, Plan", () => {
  const groups = visibleModelNavGroups(modelNavGroups(B), false);
  assert.deepEqual(groups.map((group) => group.label), [null, "Business", "Technology", "Organisation", "Plan"]);
  assert.deepEqual(groups[0]!.items.map((item) => item.label), ["Overview"]);
  assert.deepEqual(groups[1]!.items.map((item) => item.label), ["Capability map", "Data domains", "Sensitive data"]);
  assert.deepEqual(groups[2]!.items.map((item) => item.label), [
    "Applications", "Platforms & cloud", "Servers & devices", "Data stores", "Connections",
  ]);
  assert.deepEqual(groups[3]!.items.map((item) => item.label), ["Vendors & contracts", "People & teams"]);
  assert.deepEqual(groups[4]!.items.map((item) => item.label), ["Roadmap & renewals", "Investments"]);
});

test("Advanced reveals only Processes, at the end of Business", () => {
  const business = visibleModelNavGroups(modelNavGroups(B), true).find((group) => group.id === "business")!;
  assert.deepEqual(business.items.map((item) => item.label), [
    "Capability map", "Data domains", "Sensitive data", "Processes",
  ]);
  assert.ok(!labels(false).includes("Processes"));
  assert.ok(labels(true).includes("Processes"));
});

test("existing Processes turn Advanced on; an explicit choice wins; stores and domains do not", () => {
  assert.equal(hasAdvancedRecords({}), false);
  assert.equal(hasAdvancedRecords({ processes: 0 }), false);
  assert.equal(advancedEnabled(null, { processes: 2 }), true);
  assert.equal(advancedEnabled(undefined, {}), false);
  assert.equal(advancedEnabled(false, { processes: 4 }), false, "turned off on purpose stays off");
  assert.equal(advancedEnabled(true, {}), true);
  const keys = modelNavGroups(B).flatMap((group) => group.items.map((item) => item.countKey).filter(Boolean));
  assert.deepEqual(keys, ["processes"], "only Processes auto-enables Advanced");
});

test("Products, Journeys and the retired heatmap are never listed", () => {
  for (const path of ["", `${B}/views/journeys`, `${B}/strategy/products`]) {
    for (const advanced of [false, true]) {
      const shown = labels(advanced, path);
      for (const gone of ["Products", "Journeys", "Capability heatmap", "AI agents", "AI models", "Locations"]) {
        assert.ok(!shown.includes(gone), `${gone} @ ${path}`);
      }
    }
  }
  assert.doesNotMatch(src("components/mvp/ModelSidebar.tsx"), /strategy\/products|views\/journeys/);
});

test("Processes stays listed on a direct URL with Advanced off; Investments is everyday", () => {
  assert.ok(labels(false, `${B}/views/processes`).includes("Processes"));
  assert.ok(labels(false).includes("Investments"));
  for (const page of ["views/processes", "views/journeys", "views/investments", "views/products", "strategy/products"]) {
    readFileSync(new URL(`../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/${page}/page.tsx`, import.meta.url));
  }
});

test("Platforms & cloud count is platforms plus locations", () => {
  assert.equal(platformsCloudCount(1, 1), 2);
  assert.equal(platformsCloudCount(0, 0), 0);
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

test("the sidebar uses the shared groups and the per-workspace toggle", () => {
  const sidebar = src("components/mvp/ModelSidebar.tsx");
  assert.match(sidebar, /visibleModelNavGroups\(modelNavGroups\(basePath\), arch\.advanced, pathname\)/);
  assert.match(src("components/mvp/ModelSidebarView.tsx"), /data-testid="arch-advanced-toggle"/);
  assert.match(src("lib/use-architecture-advanced.ts"), /workspaceSettingsApi\.save/);
  assert.match(src("components/mvp/ModelSidebarView.tsx"), /ADVANCED_TOOLTIP/);
});
