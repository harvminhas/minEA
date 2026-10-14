import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { choiceFromHosting, draftsFromCards } from "./card-drafts";

test("cards' location picks prefill the where step", () => {
  assert.equal(choiceFromHosting("saas"), "saas");
  assert.equal(choiceFromHosting("on_premise"), "own");
  assert.equal(choiceFromHosting("desktop"), "desktop");
  assert.equal(choiceFromHosting(undefined), "unknown");
});

test("saved cards link back to drafts by tool or typed name", () => {
  const drafts = [
    { input: "sf", tool: { name: "Salesforce" }, choice: "unknown" as const },
    { input: "Order Entry", tool: null, choice: "unknown" as const },
    { input: "Nothing", tool: null, choice: "unknown" as const },
  ];
  const out = draftsFromCards(drafts, [
    { id: "a", name: "Salesforce", type: "application", properties: { hosting_model: "saas" } },
    { id: "b", name: "order entry", type: "application", properties: { hosting_model: "on_premise" } },
  ], ["a"]);
  assert.equal(out[0].objectId, "a");
  assert.equal(out[0].choice, "saas");
  assert.equal(out[1].objectId, "b");
  assert.equal(out[1].choice, "own");
  assert.equal(out[2].objectId, undefined);
});

test("wizard step 1 uses the shared add panel, not its own table", () => {
  const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.match(src, /<AppAddPanel[\s\S]*origin="setup"/);
  assert.doesNotMatch(src, /We found \{drafts\.length\} items/);
  assert.doesNotMatch(src, /setup-results/);
  assert.match(src, /Skip for now/);
  assert.match(src, /Next →/);
  assert.match(src, /Your map needs both/);
});

test("a 'Did you mean' answer carries into the later wizard steps", () => {
  const base = { input: "ArchGIS", tool: { name: "ArcGIS Online" }, choice: "unknown" as const, status: "weak" };
  const [accepted] = draftsFromCards([base], [{ id: "o1", name: "ArcGIS Online", type: "application" }]);
  assert.equal(accepted!.status, "matched");
  const [kept] = draftsFromCards([base], [{ id: "o2", name: "ArchGIS", type: "application" }]);
  assert.equal(kept!.status, "custom");
  assert.equal(kept!.tool, null);
});
