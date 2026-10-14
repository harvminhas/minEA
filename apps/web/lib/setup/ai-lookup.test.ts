import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareRows } from "@/lib/setup/add-plan";
import { applySuggestions, builtInHouse, clearLookupCache, namesToLookUp, rememberFailed, rememberLookups } from "./ai-lookup";

beforeEach(() => clearLookupCache());

test("only unmatched, non-generic new names are looked up, once", () => {
  const rows = prepareRows("ArcGIS, test, website, Gizmo Planner", "app", []);
  assert.deepEqual(namesToLookUp(rows, new Set()), ["Gizmo Planner"]);
  rememberLookups(["Gizmo Planner"], [{ input: "Gizmo Planner", status: "unknown" }]);
  assert.deepEqual(namesToLookUp(rows, new Set()), []);
});

test("a suggestion fills a Custom card, marked suggested and with no cost", () => {
  const rows = prepareRows("Tekla Structures, test", "app", []);
  rememberLookups(["Tekla Structures"], [{ input: "Tekla Structures", status: "suggested", name: "Tekla Structures", vendor: "Trimble", category: "Construction", hosting: "desktop", kind: "app", confidence: 0.9 }]);
  const next = applySuggestions(rows, new Set());
  const card = next.find((row) => row.input === "Tekla Structures")!;
  assert.equal(card.status, "matched");
  assert.equal(card.name, "Tekla Structures");
  assert.equal(card.tool?.suggested, true);
  assert.equal(card.tool?.typicalAnnual, null);
  assert.equal(card.choice, "desktop");
  assert.equal(next.find((row) => row.input === "test")?.status, "custom");
  assert.equal(applySuggestions(next, new Set()), next, "stable when nothing changes");
  const mine = { ...card, ...builtInHouse(card) };
  assert.equal(mine.status, "custom");
  assert.equal(mine.customBuilt, true);
  assert.equal(mine.name, "Tekla Structures");
  assert.equal(applySuggestions([mine], new Set())[0]?.status, "custom");
});

test("failed lookups leave the card Custom and are not retried", () => {
  const rows = prepareRows("Gizmo Planner", "app", []);
  rememberFailed(["Gizmo Planner"]);
  assert.deepEqual(namesToLookUp(rows, new Set()), []);
  assert.equal(applySuggestions(rows, new Set()), rows);
});

test("the shared add cards (Applications, Ask, setup wizard) run the lookup and show Suggested", () => {
  const src = readFileSync(new URL("../../components/add/AddCards.tsx", import.meta.url), "utf8");
  assert.match(src, /catalogLookupApi\.lookup/);
  assert.match(src, /LOOKUP_DEBOUNCE_MS/);
  assert.match(src, /data-testid="suggested-label"/);
  assert.match(src, /We built it ourselves/);
  const panel = readFileSync(new URL("../../components/add/AppAddPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /<AddFlow/);
});
