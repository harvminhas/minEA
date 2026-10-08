/**
 * Live-test bug (stripe-p1): back from the Customer Portal after Team -> Business, the billing tab
 * showed "Business (legacy)", Licences "Loading…" and "Switch to Starter/Team/Business" for about
 * a minute. The page derived the plan from org.plan ("business") while billing status was not in
 * hand, and "business" + unknown subscription = legacy + checkout buttons.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { BillingStatus } from "@minea/types";
import { packActionFor, parsePortalReturn, RETURN_REFETCH_MS, showManageBilling } from "./checkout.ts";
import { planFromStatus, resolveDisplayPlan } from "./plans.ts";

function status(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: "business",
    stripe_configured: true,
    can_upgrade_solo: false,
    has_subscription: true,
    own_workspace_count: 1,
    own_workspace_limit: null,
    can_create_own_workspace: true,
    active_share_link_count: 0,
    active_share_link_limit: null,
    can_create_share_link: true,
    checkout_available: true,
    checkout_allowed: false,
    display_plan: "business",
    licences_used: 1,
    licences_cap: 10,
    over_licence_cap: false,
    has_billing_account: true,
    can_manage_billing: true,
    ...overrides,
  };
}

test("repro: the old derivation turned a Stripe Business org into legacy while status loaded", () => {
  const orgPlan = "business"; // org.plan after the portal switch
  const billingStatus: BillingStatus | undefined = undefined; // request still in flight
  const old = resolveDisplayPlan({ plan: billingStatus?.plan ?? orgPlan, hasSubscription: billingStatus?.has_subscription });
  assert.equal(old, "business_legacy"); // what Harvinder saw
  // Fixed: no status, no plan (the tab shows a loading state with no buttons).
  assert.equal(planFromStatus(billingStatus), null);
  assert.equal(planFromStatus(undefined, null), null);
});

test("plan comes from the API's display_plan once status is in", () => {
  assert.equal(planFromStatus(status()), "business");
  assert.equal(planFromStatus(status({ plan: "team", display_plan: "team" })), "team");
  assert.equal(planFromStatus(status({ has_subscription: false, display_plan: "business_legacy", checkout_allowed: true })), "business_legacy");
  // Plan row not updated yet but Stripe already has the subscription: API sends the live plan.
  assert.equal(planFromStatus(status({ plan: "free", display_plan: "team" })), "team");
});

test("a subscription is never shown as legacy, whatever the label", () => {
  assert.equal(planFromStatus(status({ display_plan: "business_legacy", has_subscription: true })), "business");
});

test("older API without display_plan falls back to plan + has_subscription", () => {
  const old = status();
  delete old.display_plan;
  assert.equal(planFromStatus(old), "business");
  assert.equal(planFromStatus({ ...old, has_subscription: false }), "business_legacy");
});

test("an org with a subscription never gets checkout buttons; Manage billing instead", () => {
  for (const plan of ["business", "business_legacy", "free", "team"] as const) {
    assert.equal(packActionFor(plan, status(), false), "portal", plan);
  }
  // checkout_allowed=false alone (API saw an open subscription in Stripe) also means portal.
  assert.equal(packActionFor("free", status({ plan: "free", has_subscription: false, checkout_allowed: false }), false), "portal");
  assert.equal(showManageBilling(status(), false), true);
  assert.equal(showManageBilling(status({ has_billing_account: false }), false), true);
});

test("checkout only for an org with no subscription", () => {
  assert.equal(
    packActionFor("business_legacy", status({ has_subscription: false, has_billing_account: false, checkout_allowed: true, display_plan: "business_legacy" }), false),
    "checkout"
  );
  assert.equal(packActionFor("free", status({ plan: "free", display_plan: "free", has_subscription: false, checkout_allowed: true }), false), "checkout");
});

test("after a cancellation the org is Free and can check out again", () => {
  const cancelled = status({ plan: "free", display_plan: "free", has_subscription: false, checkout_allowed: true, has_billing_account: true });
  assert.equal(planFromStatus(cancelled), "free");
  assert.equal(packActionFor("free", cancelled, false), "checkout");
  assert.equal(showManageBilling(cancelled, false), true); // past invoices stay reachable
});

test("portal return is detected and refetched for ~20s", () => {
  assert.equal(parsePortalReturn("return"), true);
  assert.equal(parsePortalReturn(null), false);
  assert.equal(parsePortalReturn("x"), false);
  assert.deepEqual([...RETURN_REFETCH_MS], [2000, 5000, 10000, 20000]);
});
