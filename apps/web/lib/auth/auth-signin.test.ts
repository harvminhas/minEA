import assert from "node:assert/strict";
import test from "node:test";
import { passwordSignInEnabled } from "./flags.ts";
import { billingUiEnabled } from "../billing/flags.ts";
import { describeAuthError, existingAccountAdvice, PASSWORD_USERS_NOTE } from "./errors.ts";

const fbErr = (code: string, email?: string) =>
  Object.assign(new Error(`Firebase: Error (${code}).`), { code, customData: email ? { email } : {} });

test("password sign-in: on in next dev, off in production builds, flag overrides", () => {
  assert.equal(passwordSignInEnabled({ nodeEnv: "development" }), true);
  assert.equal(passwordSignInEnabled({ nodeEnv: "production" }), false);
  assert.equal(passwordSignInEnabled({ nodeEnv: "production", flag: "1" }), true);
  assert.equal(passwordSignInEnabled({ nodeEnv: "production", flag: "true" }), true);
  assert.equal(passwordSignInEnabled({ nodeEnv: "development", flag: "0" }), false);
  assert.equal(passwordSignInEnabled({ nodeEnv: "production", flag: "nonsense" }), false);
});

test("billing flag keeps its behaviour after sharing the helper", () => {
  assert.equal(billingUiEnabled({ nodeEnv: "production" }), false);
  assert.equal(billingUiEnabled({ nodeEnv: "production", flag: "1" }), true);
  assert.equal(billingUiEnabled({ nodeEnv: "development" }), true);
  assert.equal(billingUiEnabled({ nodeEnv: "development", flag: "off" }), false);
});

test("Microsoft not enabled in Firebase yet", () => {
  const info = describeAuthError(fbErr("auth/operation-not-allowed"), "microsoft");
  assert.equal(info.kind, "provider_disabled");
  assert.match(info.message, /^Microsoft sign-in isn't available yet/);
});

test("popup closed and popup blocked read cleanly", () => {
  for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]) {
    assert.equal(describeAuthError(fbErr(code), "microsoft").kind, "cancelled");
  }
  const blocked = describeAuthError(fbErr("auth/popup-blocked"), "microsoft");
  assert.equal(blocked.kind, "popup_blocked");
  assert.match(blocked.message, /blocked the Microsoft sign-in window/);
  assert.doesNotMatch(blocked.message, /Firebase/);
});

test("account exists: email comes from the error", () => {
  const info = describeAuthError(fbErr("auth/account-exists-with-different-credential", "pat@contoso.com"), "microsoft");
  assert.equal(info.kind, "account_exists");
  assert.equal(info.email, "pat@contoso.com");
});

test("other errors never leak raw Firebase codes for known cases", () => {
  assert.equal(describeAuthError(fbErr("auth/invalid-credential"), "password").message, "That email and password don't match.");
  assert.equal(describeAuthError(fbErr("auth/network-request-failed")).kind, "network");
  assert.equal(describeAuthError(fbErr("auth/unauthorized-domain")).kind, "unauthorized_domain");
  assert.equal(describeAuthError(new Error("boom")).message, "boom");
  assert.equal(describeAuthError("weird").message, "Sign-in failed. Please try again.");
});

test("advice when Firebase says the account uses Google", () => {
  const a = existingAccountAdvice("microsoft", "pat@contoso.com", ["google.com"]);
  assert.deepEqual(a.options, ["google"]);
  assert.match(a.message, /signs in with Google\. Sign in with Google below/);
  assert.match(a.message, /connect Microsoft to the same account/);
});

test("advice when the account uses a password", () => {
  const a = existingAccountAdvice("microsoft", "pat@contoso.com", ["password"]);
  assert.deepEqual(a.options, ["password"]);
  assert.match(a.message, /email and password \(once\)/);
});

test("advice with email-enumeration protection (no methods returned) stays useful", () => {
  const a = existingAccountAdvice("microsoft", "pat@contoso.com", []);
  assert.deepEqual(a.options, ["google", "password"]);
  assert.match(a.message, /Sign in the way you did before \(Google, or email and password\)/);
  const g = existingAccountAdvice("google", null, []);
  assert.deepEqual(g.options, ["microsoft", "password"]);
  assert.match(g.message, /^This email already has/);
});

test("the attempted provider is never offered back", () => {
  const a = existingAccountAdvice("microsoft", "x@y.com", ["microsoft.com", "google.com", "password"]);
  assert.deepEqual(a.options, ["google", "password"]);
});

test("note for old password users", () => {
  assert.match(PASSWORD_USERS_NOTE, /Google or Microsoft using the same email/);
});
