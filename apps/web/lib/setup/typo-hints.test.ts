import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchEntries, SETUP_MATCH_KINDS } from "@/lib/setup/match-tools";
import { namesToLookUp } from "@/lib/setup/ai-lookup";
import { cardQuestion } from "@/lib/setup/add-cards";
import type { AddRow } from "@/lib/setup/add-plan";

const one = (text: string) => matchEntries(text, SETUP_MATCH_KINDS)[0]!;

test("typos ask 'Did you mean' instead of matching silently", () => {
  for (const [typed, tool] of [["ArchGIS", "ArcGIS Online"], ["Procor", "Procore"], ["Salesfroce", "Salesforce"]] as const) {
    const row = one(typed);
    assert.equal(row.status, "weak", typed);
    assert.equal(row.tool?.name, tool, typed);
  }
  assert.equal(one("Procore").status, "matched");
  assert.equal(one("Slack").status, "matched");
});

test("generic words are not stretched onto a product", () => {
  for (const word of ["test", "website", "email", "accounting", "crm"]) {
    assert.notEqual(one(word).status, "weak", word);
  }
});

test("keeping the typed name stops further suggestions", () => {
  const row = { key: "1", input: "Procor", name: "Procor", status: "custom", tool: null, options: [], customBuilt: false, kind: "app", choice: "unknown", existing: null, hint: null } as AddRow;
  assert.deepEqual(namesToLookUp([row], new Set()), ["Procor"]);
  assert.deepEqual(namesToLookUp([{ ...row, keptTyped: true }], new Set()), []);
  assert.equal(cardQuestion({ ...row, status: "weak" }), "fuzzy");
  const card = readFileSync(new URL("../../components/add/AddCards.tsx", import.meta.url), "utf8");
  assert.match(card, /Did you mean <strong>/);
  assert.match(card, /keptTyped: true/);
});
