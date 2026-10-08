import assert from "node:assert/strict";
import { test } from "node:test";
import { OWN_LOGIN, isOwnLogin, isSignInCandidate, orderSignInChoices, signInCounts, toggleSignInPick } from "./sign-in.ts";

test("only apps and platforms in use can sign in with something", () => {
  assert.equal(isSignInCandidate({ type: "application", status: "active" }), true);
  assert.equal(isSignInCandidate({ type: "cloud_service", properties: { lifecycle: "active" } }), true);
  assert.equal(isSignInCandidate({ type: "solution" }), true);
  assert.equal(isSignInCandidate({ type: "model" }), false);
  assert.equal(isSignInCandidate({ type: "external_party" }), false);
  assert.equal(isSignInCandidate({ type: "application", status: "retired" }), false);
  assert.equal(isSignInCandidate({ type: "cloud_service", properties: { lifecycle: "end_of_life" } }), false);
  assert.equal(isOwnLogin({ sign_in: "own_login" }), true);
  assert.equal(isOwnLogin({}), false);
  assert.equal(isOwnLogin(null), false);
});

test("the picker puts what others already sign in with first, then identity providers", () => {
  const choices = [
    { id: "a", name: "Asana" },
    { id: "okta", name: "Okta" },
    { id: "m365", name: "Microsoft 365" },
    { id: "g", name: "Google Workspace" },
  ];
  const counts = signInCounts([
    { type: "authenticates_via", to_object_id: "m365" },
    { type: "authenticates_via", to_object_id: "m365" },
    { type: "authenticates_via", to_object_id: "g" },
    { type: "runs_on", to_object_id: "a" },
  ]);
  assert.equal(counts.get("m365"), 2);
  assert.equal(counts.has("a"), false);
  const ordered = orderSignInChoices(choices, counts, (choice) => choice.id === "okta");
  assert.deepEqual(ordered.map((choice) => choice.id), ["m365", "g", "okta", "a"]);
});

test("Own login is exclusive", () => {
  assert.deepEqual(toggleSignInPick(["m365", "okta"], OWN_LOGIN), [OWN_LOGIN]);
  assert.deepEqual(toggleSignInPick([OWN_LOGIN], "m365"), ["m365"]);
  assert.deepEqual(toggleSignInPick(["m365"], "okta"), ["m365", "okta"]);
  assert.deepEqual(toggleSignInPick(["m365", "okta"], "m365"), ["okta"]);
  assert.deepEqual(toggleSignInPick([OWN_LOGIN], OWN_LOGIN), []);
});
