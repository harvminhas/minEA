import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalOwner, ownerKey, ownerPicks } from "./owner-picks";

test("picks merge workspace names and names typed on other rows, one spelling each", () => {
  assert.deepEqual(ownerPicks(["Finance", "Sales"], ["sales ", "Ops", "", "  ops", "IT  Team"]), ["Finance", "Sales", "Ops", "IT Team"]);
  assert.equal(ownerKey("  IT   team "), "it team");
});

test("a typed name reuses the existing spelling; new names are kept tidy", () => {
  const picks = ["Sales", "Chris B"];
  assert.equal(canonicalOwner("sales ", picks), "Sales");
  assert.equal(canonicalOwner("chris  b", picks), "Chris B");
  assert.equal(canonicalOwner("  New   Team ", picks), "New Team");
  assert.equal(canonicalOwner("   ", picks), "");
});

test("setup step 4 and the owner gap editor offer the picks", () => {
  const setup = readFileSync(new URL("../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.match(setup, /useOwnerPicks\(apps\.map\(\(app\) => app\.ownerTeam\), apps\.map\(\(app\) => app\.ownerName\)\)/);
  assert.match(setup, /list=\{TEAM_PICKS_ID\}/);
  assert.match(setup, /list=\{PERSON_PICKS_ID\}/);
  assert.match(setup, /canonicalOwner\(app\.ownerTeam/);
  const cards = readFileSync(new URL("../components/add/AddCards.tsx", import.meta.url), "utf8");
  assert.match(cards, /kind === "owner" \? TEAM_PICKS_ID/);
});
