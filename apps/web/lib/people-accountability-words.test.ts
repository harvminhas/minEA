import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNTABILITY_LINK_OPTIONS, LINK_KINDS_BY_ENTITY, accountabilityEntityKindOf, accountabilityWords } from "./people-utils.ts";

test("team ownership reads Owns from the team and Owned by from the entity", () => {
  assert.equal(accountabilityWords({ link_kind: "owns" }), "Owns");
  assert.equal(accountabilityWords({ link_kind: "owns" }, "entity"), "Owned by");
  // A legacy owner row written as manages still reads as ownership.
  assert.equal(accountabilityWords({ link_kind: "manages", is_owner: true }), "Owns");
  assert.equal(accountabilityWords({ link_kind: "manages", is_owner: true }, "entity"), "Owned by");
  assert.equal(accountabilityWords({ link_kind: "manages" }), "Manages");
  assert.equal(accountabilityWords({ link_kind: "approves" }, "entity"), "Approved by");
  assert.equal(ACCOUNTABILITY_LINK_OPTIONS.owns.label, "Owns");
  assert.ok(LINK_KINDS_BY_ENTITY.application.includes("owns"));
  assert.equal(accountabilityEntityKindOf("solution"), "application");
  assert.equal(accountabilityEntityKindOf("cloud_service"), null);
});
