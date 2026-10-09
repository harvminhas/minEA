import assert from "node:assert/strict";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BillingStatus } from "@minea/types";
import { summarizeLicences } from "../../lib/billing/licences.ts";
import type { DisplayPlanId } from "../../lib/billing/plans.ts";

// Classic JSX runtime under tsx: React must be global before the component loads.
(globalThis as { React?: typeof React }).React = React;
let BillingCentre: typeof import("./BillingCentre.tsx").BillingCentre;
before(async () => {
  ({ BillingCentre } = await import("./BillingCentre.tsx"));
});

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
    display_plan: "free",
    licences_used: 1,
    licences_cap: 1,
    over_licence_cap: false,
    has_billing_account: false,
    can_manage_billing: true,
    ...overrides,
  };
}

const noop = async () => {};

function render(plan: DisplayPlanId, s: BillingStatus | undefined, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(BillingCentre, {
      displayPlan: plan,
      realPlan: plan,
      previewing: false,
      billingStatus: s,
      licences: summarizeLicences(s?.licences_used ?? 1, s?.licences_cap ?? null),
      onCheckout: noop,
      onOpenPortal: noop,
      ...extra,
    })
  );
}

const actions = (html: string) => [...html.matchAll(/data-action="([a-z_]+)"/g)].map((m) => m[1]);

test("Stripe live for a Free org: pack buttons start checkout, no Manage billing yet", () => {
  const html = render("free", status());
  assert.deepEqual(actions(html), ["checkout", "checkout", "checkout"]);
  assert.doesNotMatch(html, /data-testid="manage-billing"/);
});

test("Stripe not configured: pack buttons keep the coming-soon dialog", () => {
  const html = render("free", status({ checkout_available: false, stripe_configured: false }));
  assert.deepEqual(actions(html), ["coming_soon", "coming_soon", "coming_soon"]);
});

test("org on Team: other packs switch in the portal and Manage billing shows", () => {
  const html = render(
    "team",
    status({ plan: "team", display_plan: "team", has_subscription: true, has_billing_account: true, licences_used: 3, licences_cap: 5 })
  );
  assert.deepEqual(actions(html), ["portal"]); // Starter blocked (3 > 1), Team current, Business via portal
  assert.match(html, /data-testid="manage-billing"/);
  assert.match(html, /Unassign 2 licences first/);
});

test("over the cap after a downgrade: banner, nobody loses access", () => {
  const html = render(
    "free",
    status({ licences_used: 5, licences_cap: 1, over_licence_cap: true, has_billing_account: true })
  );
  assert.match(html, /data-testid="over-cap-banner"/);
  assert.match(html, /5 people hold licences but your plan includes 1/);
  assert.match(html, /Everyone keeps access/);
});

test("member without billing rights sees disabled buttons and why", () => {
  const html = render("free", status({ can_manage_billing: false }));
  assert.match(html, /Only org owners and admins with a verified email can change the plan/);
  assert.equal((html.match(/<button[^>]*data-action="checkout"[^>]*disabled=""/g) ?? []).length, 3);
});

test("checkout return notice", () => {
  assert.match(render("free", status(), { checkoutReturn: "success" }), /Payment received/);
  assert.match(render("free", status(), { checkoutReturn: "cancelled" }), /No charge was made/);
});

test("dev preview never offers real checkout or the banner", () => {
  const html = renderToStaticMarkup(
    React.createElement(BillingCentre, {
      displayPlan: "team",
      realPlan: "free",
      previewing: true,
      billingStatus: status({ over_licence_cap: true, licences_used: 3, has_billing_account: true }),
      licences: summarizeLicences(1, 5),
      onCheckout: noop,
      onOpenPortal: noop,
    })
  );
  assert.ok(actions(html).every((a) => a === "coming_soon"));
  assert.doesNotMatch(html, /over-cap-banner|manage-billing/);
});

// ── live-test fix: never legacy / checkout while billing status is unknown ──

test("repro: status still loading shows a loading state, no plan and no buttons", () => {
  const html = renderToStaticMarkup(
    React.createElement(BillingCentre, {
      displayPlan: null,
      realPlan: null,
      previewing: false,
      billingStatus: undefined,
      licences: null,
      onCheckout: noop,
      onOpenPortal: noop,
    })
  );
  assert.match(html, /data-testid="billing-status-loading"/);
  assert.doesNotMatch(html, /legacy/i);
  assert.doesNotMatch(html, /Switch to/);
  assert.deepEqual(actions(html), []);
});

test("status failed: error with retry, still no buttons", () => {
  const html = renderToStaticMarkup(
    React.createElement(BillingCentre, {
      displayPlan: null,
      realPlan: null,
      previewing: false,
      billingStatus: undefined,
      licences: null,
      statusError: true,
      onRetryStatus: () => {},
    })
  );
  assert.match(html, /data-testid="billing-status-error"/);
  assert.match(html, /Try again/);
  assert.deepEqual(actions(html), []);
});

test("Business pack right after the portal switch: Manage billing, portal only, never checkout", () => {
  const s = status({
    plan: "business",
    display_plan: "business",
    has_subscription: true,
    checkout_allowed: false,
    has_billing_account: true,
    licences_used: 1,
    licences_cap: 10,
  });
  const html = render("business", s, { portalReturn: true });
  assert.match(html, /data-testid="current-plan">Business</);
  assert.doesNotMatch(html, /legacy/i);
  assert.match(html, /data-testid="manage-billing"/);
  assert.match(html, /data-testid="portal-return"/);
  assert.ok(!actions(html).includes("checkout"));
  assert.deepEqual(actions(html), ["portal", "portal"]);
});

test("Stripe has a subscription the org row doesn't show yet: no checkout buttons", () => {
  const s = status({ plan: "free", display_plan: "team", has_subscription: true, checkout_allowed: false, has_billing_account: true, licences_cap: 5 });
  const html = render("team", s);
  assert.ok(!actions(html).includes("checkout"));
  assert.match(html, /data-testid="manage-billing"/);
});

test("true legacy org (no subscription, no customer) still checks out", () => {
  const s = status({ plan: "business", display_plan: "business_legacy", has_subscription: false, checkout_allowed: true, licences_cap: null });
  const html = render("business_legacy", s);
  assert.match(html, /Business \(legacy\)/);
  assert.deepEqual(actions(html), ["checkout", "checkout", "checkout"]);
  assert.doesNotMatch(html, /data-testid="manage-billing"/);
});

test("paid plans coming soon: Free org sees three disabled Coming soon buttons and a note", () => {
  const html = render("free", status({ paid_plans_available: false, checkout_allowed: false }));
  assert.deepEqual(actions(html), ["unavailable", "unavailable", "unavailable"]);
  const buttons = [...html.matchAll(/<button type="button" data-action="unavailable"([^>]*)>([^<]*)<\/button>/g)];
  assert.equal(buttons.length, 3);
  for (const [, attrs, text] of buttons) {
    assert.match(attrs, /disabled=""/);
    assert.equal(text, "Coming soon");
  }
  assert.match(html, /data-testid="paid-coming-soon"/);
  assert.doesNotMatch(html, /Upgrade to /);
  assert.doesNotMatch(html, /data-action="checkout"/);
  assert.doesNotMatch(html, /Only org owners and admins/);
  // Prices stay visible.
  assert.match(html, /\$99/);
  assert.match(html, /\$449/);
  assert.match(html, /\$799/);
});

test("paid plans coming soon: legacy Business keeps its current-plan view, packs Coming soon", () => {
  const html = render("business_legacy", status({ plan: "business", display_plan: "business_legacy", paid_plans_available: false, checkout_allowed: false }));
  assert.deepEqual(actions(html), ["unavailable", "unavailable", "unavailable"]);
  assert.match(html, /data-testid="current-plan">Business \(legacy\)</);
});

test("paid plans coming soon: subscribed org still switches in the portal with Manage billing", () => {
  const html = render(
    "team",
    status({ plan: "team", display_plan: "team", has_subscription: true, has_billing_account: true, licences_used: 1, licences_cap: 5, paid_plans_available: false, checkout_allowed: false })
  );
  assert.deepEqual(actions(html), ["portal", "portal"]);
  assert.match(html, /data-testid="manage-billing"/);
  assert.doesNotMatch(html, /Coming soon/);
  assert.doesNotMatch(html, /data-testid="paid-coming-soon"/);
});

test("allowlisted org: pack buttons are enabled and start real checkout", () => {
  const html = render("free", status({ paid_plans_available: true, checkout_allowed: true }));
  assert.deepEqual(actions(html), ["checkout", "checkout", "checkout"]);
  assert.match(html, /Upgrade to Starter/);
  assert.doesNotMatch(html, /Coming soon/);
  assert.doesNotMatch(html, /data-testid="paid-coming-soon"/);
  assert.equal((html.match(/data-action="checkout"[^>]*disabled=""/g) ?? []).length, 0);
});
