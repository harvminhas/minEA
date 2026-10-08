import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OWN_LOGIN,
  SIGN_IN_HINT,
  catalogToolFor,
  isIdentityProvider,
  isOwnLogin,
  isSignInCandidate,
  orderSignInChoices,
  signInCounts,
  signInSuggestion,
  toggleSignInPick,
} from "./sign-in.ts";

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

test("the catalog marks identity providers and tools that usually use single sign-on", () => {
  assert.equal(isIdentityProvider({ name: "Microsoft 365" }), true);
  assert.equal(isIdentityProvider({ name: "Google Workspace" }), true);
  assert.equal(isIdentityProvider({ name: "Okta" }), true);
  assert.equal(isIdentityProvider({ name: "Azure AD" }), true);
  assert.equal(catalogToolFor({ name: "Azure AD" })?.name, "Microsoft Entra ID");
  assert.equal(isIdentityProvider({ name: "Dynamics 365" }), false);
  assert.equal(isIdentityProvider({ name: "Salesforce" }), false);
  assert.equal(catalogToolFor({ name: "Salesforce Sales Cloud" })?.ssoUsual, true);
  assert.equal(catalogToolFor({ name: "Video calls", properties: { catalog_tool: "zoom workplace" } })?.ssoUsual, true);
  assert.equal(catalogToolFor({ name: "Order Entry" }), null);
});

test("Signs in with hint: a one-click pick only when one provider is obvious", () => {
  const sf = { id: "sf", type: "application", name: "Salesforce", properties: {} };
  const m365 = { id: "m365", type: "cloud_service", name: "Microsoft 365", properties: {} };
  const okta = { id: "okta", type: "application", name: "Okta", properties: {} };
  const ns = { id: "ns", type: "application", name: "NetSuite", properties: {} };
  const qbo = { id: "qbo", type: "application", name: "QuickBooks Online", properties: {} };

  assert.deepEqual(signInSuggestion(sf, [sf, m365, qbo], []), { hint: SIGN_IN_HINT, provider: { id: "m365", name: "Microsoft 365" } });
  assert.deepEqual(signInSuggestion(sf, [sf, m365, okta], []), { hint: SIGN_IN_HINT, provider: null }, "two identity providers: hint only");
  // Once something signs in with Okta, Okta is the obvious pick.
  const links = [{ type: "authenticates_via", from_object_id: "ns", to_object_id: "okta" }];
  assert.deepEqual(signInSuggestion(sf, [sf, m365, okta, ns], links)?.provider, { id: "okta", name: "Okta" });
  assert.equal(signInSuggestion(qbo, [qbo, m365], []), null, "QuickBooks is not marked as usually SSO");
  assert.equal(signInSuggestion({ ...sf, properties: { sign_in: "own_login" } }, [sf, m365], []), null);
  assert.equal(signInSuggestion(ns, [ns, okta], links), null, "already set");
});
