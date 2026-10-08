import assert from "node:assert/strict";
import test from "node:test";
import type { BillingStatus } from "@minea/types";
import {
  billingErrorMessage,
  canStartBilling,
  checkoutBody,
  checkoutReturnNotice,
  overCapBanner,
  packActionFor,
  parseCheckoutReturn,
  showManageBilling,
} from "./checkout.ts";

function status(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: "free",
    stripe_configured: true,
    can_upgrade_solo: false,
    has_subscription: false,
    own_workspace_count: 1,
    own_workspace_limit: 1,
    can_create_own_workspace: false,
    active_share_link_count: 0,
    active_share_link_limit: 1,
    can_create_share_link: true,
    checkout_available: true,
    has_billing_account: false,
    can_manage_billing: true,
    ...overrides,
  };
}

test("no Stripe for this org keeps the coming-soon dialog", () => {
  assert.equal(packActionFor("free", status({ checkout_available: false }), false), "coming_soon");
  assert.equal(packActionFor("free", undefined, false), "coming_soon");
  // Older API without the field.
  const old = status();
  delete old.checkout_available;
  assert.equal(packActionFor("free", old, false), "coming_soon");
});

test("dev preview never starts a real checkout", () => {
  assert.equal(packActionFor("free", status(), true), "coming_soon");
  assert.equal(showManageBilling(status({ has_billing_account: true }), true), false);
});

test("free and legacy orgs check out; pack orgs switch in the portal", () => {
  assert.equal(packActionFor("free", status(), false), "checkout");
  assert.equal(packActionFor("business_legacy", status({ plan: "business" }), false), "checkout");
  assert.equal(packActionFor("team", status({ plan: "team", has_subscription: true }), false), "portal");
  assert.equal(packActionFor("business", status({ plan: "business", has_subscription: true }), false), "portal");
});

test("Manage billing appears once the org has a Stripe customer", () => {
  assert.equal(showManageBilling(status(), false), false);
  assert.equal(showManageBilling(status({ has_billing_account: true }), false), true);
  assert.equal(showManageBilling(status({ has_billing_account: true, checkout_available: false }), false), false);
});

test("only owner/admin with a verified email can start billing", () => {
  assert.equal(canStartBilling(status()), true);
  assert.equal(canStartBilling(status({ can_manage_billing: false })), false);
  assert.equal(canStartBilling(undefined), false);
});

test("checkout return notices", () => {
  assert.equal(parseCheckoutReturn("success"), "success");
  assert.equal(parseCheckoutReturn("cancelled"), "cancelled");
  assert.equal(parseCheckoutReturn("other"), null);
  assert.equal(parseCheckoutReturn(null), null);
  assert.match(checkoutReturnNotice("success"), /plan updates/);
  assert.match(checkoutReturnNotice("cancelled"), /No charge/);
});

test("over-cap banner says nobody loses access", () => {
  const text = overCapBanner(5, 1);
  assert.match(text, /5 people hold licences/);
  assert.match(text, /includes 1/);
  assert.match(text, /Everyone keeps access/);
  assert.match(text, /4 licences are freed/);
  assert.match(overCapBanner(6, 5), /1 licence is freed/);
});

test("API errors become readable messages", () => {
  assert.equal(
    billingErrorMessage(new Error('409 {"code":"already_subscribed","message":"Use Manage billing."} (/orgs/a/billing/checkout)')),
    "Use Manage billing."
  );
  assert.equal(
    billingErrorMessage(new Error("403 Verify your email to manage billing (/orgs/a/billing/checkout)")),
    "Verify your email to manage billing"
  );
});

test("checkout request body", () => {
  assert.deepEqual(checkoutBody("team", "yearly"), { plan: "team", interval: "yearly" });
});
