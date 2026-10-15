import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOL_CATALOG, setupMatch } from "@/lib/setup/match-tools";
import { applyCatalog, refreshLiveCatalog, resetToBundled, validTools } from "./live-catalog";

afterEach(() => resetToBundled());

const live = () => [
  ...TOOL_CATALOG.slice(0, 20),
  { name: "Tekla Structures", aliases: ["tekla"], vendor: "Trimble", category: "Construction", hosting: "desktop", kind: "app", typicalAnnual: null, unit: "year" },
];

test("the API catalogue replaces the bundled list for every matcher", () => {
  assert.equal(setupMatch("tekla")[0]?.status, "custom");
  assert.ok(applyCatalog(live(), "v1"));
  assert.equal(TOOL_CATALOG.length, 21);
  assert.equal(setupMatch("tekla")[0]?.tool?.name, "Tekla Structures");
  assert.equal(setupMatch("tekla")[0]?.tool?.vendor, "Trimble");
  resetToBundled();
  assert.ok(TOOL_CATALOG.length >= 500);
});

test("a bad payload keeps the bundled list", () => {
  const before = TOOL_CATALOG.length;
  assert.equal(validTools([{ name: "x" }]), null);
  assert.equal(applyCatalog({ nope: true }, "v2"), false);
  assert.equal(applyCatalog([...live(), { name: "Bad", aliases: [], hosting: "moon", kind: "app" }], "v3"), false);
  assert.equal(TOOL_CATALOG.length, before);
});

test("API down: refresh resolves and the bundled list stays", async () => {
  const before = TOOL_CATALOG.length;
  await refreshLiveCatalog(() => Promise.reject(new Error("offline")), true);
  assert.equal(TOOL_CATALOG.length, before);
});

test("the catalogue admin link shows only for platform admins; the page edits every field", () => {
  const nav = readFileSync(new URL("../../components/nav/TopNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /platformMe\.data\?\.platformAdmin && \(/);
  assert.match(nav, /href="\/platform\/users"/);
  const page = readFileSync(new URL("../../components/platform/CatalogAdmin.tsx", import.meta.url), "utf8");
  for (const label of ["Name", "Vendor", "Aliases", "Category", "Hosting", "Kind", "Typical annual cost", "single sign-on", "Add to catalog", "Delete", "Search"]) {
    assert.match(page, new RegExp(label), label);
  }
});
