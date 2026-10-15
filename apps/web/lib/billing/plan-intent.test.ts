import { test } from "node:test";
import assert from "node:assert/strict";
import type { BillingStatus } from "@minea/types";
import { orgSlugFromPath, parsePlanIntent, shouldAutoStartStarter, starterBillingHref, starterCtaHref } from "./plan-intent";

const open = { checkout_available: true, paid_plans_available: true, can_manage_billing: true, has_subscription: false } as unknown as BillingStatus;

test("Get Starter: signed out signs up then lands on /home?plan=starter; signed in goes straight there", () => {
  assert.equal(starterCtaHref(false), "/auth/sign-up?redirect_url=%2Fhome%3Fplan%3Dstarter");
  assert.equal(starterCtaHref(true), "/home?plan=starter");
  assert.equal(parsePlanIntent("starter"), "starter");
  assert.equal(parsePlanIntent("business"), null);
});

test("/home sends the intent to that org's Plan & billing tab", () => {
  assert.equal(starterBillingHref("hmin-edomains"), "/orgs/hmin-edomains/settings?tab=billing&start=starter");
  assert.equal(orgSlugFromPath("/orgs/acme/workspaces/default/ask"), "acme");
  assert.equal(orgSlugFromPath("/onboarding"), null);
});

test("checkout starts on arrival only for a Free org whose user may buy and the server allows it", () => {
  assert.equal(shouldAutoStartStarter("starter", "free", open), true);
  assert.equal(shouldAutoStartStarter(null, "free", open), false);
  assert.equal(shouldAutoStartStarter("starter", "starter", { ...open, has_subscription: true }), false);
  assert.equal(shouldAutoStartStarter("starter", "free", { ...open, can_manage_billing: false }), false);
  assert.equal(shouldAutoStartStarter("starter", "free", { ...open, paid_plans_available: false }), false);
  assert.equal(shouldAutoStartStarter("starter", "free", { ...open, checkout_available: false }), false);
  assert.equal(shouldAutoStartStarter("starter", null, undefined), false);
});

test("/home, onboarding and the billing tab are wired to the intent", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../../app/home/page.tsx"), /intent === "starter"[\s\S]{0,160}starterBillingHref\(slug\)/);
  assert.match(read("../../app/onboarding/page.tsx"), /takePlanIntent\(\) === "starter" \? starterBillingHref\(org\.slug\)/);
  assert.match(read("../../app/orgs/[orgSlug]/settings/page.tsx"), /shouldAutoStartStarter\(startIntent, realPlan, billingStatus\)[\s\S]{0,80}startCheckout\("starter", "monthly"\)/);
});
