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
