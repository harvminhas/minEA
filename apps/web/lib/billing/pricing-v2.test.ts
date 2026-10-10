import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_DETAILS,
  CATALOG,
  PACK_ORDER,
  PUBLIC_PACK_ORDER,
  PUBLIC_PLAN_ORDER,
  hasYearly,
  priceLabel,
  isRetiredPack,
  isSelfServePack,
  packsToShow,
} from "./plans.ts";
import {
  BUSINESS_GET_STARTED_PATH,
  businessGetStartedHref,
  businessRequestBody,
  validateBusinessRequest,
  type BusinessRequestInput,
} from "./business-request.ts";

test("on sale: Free, Starter, Business. Team stays defined for grandfathered orgs", () => {
  assert.deepEqual(PUBLIC_PLAN_ORDER, ["free", "starter", "business"]);
  assert.deepEqual(PUBLIC_PACK_ORDER, ["starter", "business"]);
  assert.deepEqual(PACK_ORDER, ["starter", "team", "business"]);
  assert.equal(CATALOG.team.label, "Team");
  assert.equal(isRetiredPack("team"), true);
  assert.equal(isRetiredPack("business"), false);
});

test("Starter is $149/mo, monthly only, and the only self-serve pack", () => {
  assert.equal(CATALOG.starter.monthlyUsd, 149);
  assert.equal(CATALOG.starter.yearlyUsd, null);
  assert.equal(hasYearly(CATALOG.starter), false);
  assert.equal(hasYearly(CATALOG.team), true);
  assert.equal(priceLabel(CATALOG.starter, "yearly"), "$149/mo");
  assert.equal(isSelfServePack("starter"), true);
  assert.equal(isSelfServePack("business"), false);
  assert.equal(isSelfServePack("team"), false);
});

test("Business details: from 5 licences, 4 hours onboarding, invoice or card, annual invoicing, no price", () => {
  const all = BUSINESS_DETAILS.join(" | ");
  assert.match(all, /Starting from 5 licences/);
  assert.match(all, /4 hours of onboarding consulting/);
  assert.match(all, /invoice or card/i);
  assert.match(all, /Annual invoicing available/);
  assert.doesNotMatch(all, /\$|contact|sales/i);
});

test("admin centre packs: Team only for an org already on Team", () => {
  assert.deepEqual(packsToShow("free"), ["starter", "business"]);
  assert.deepEqual(packsToShow("starter"), ["starter", "business"]);
  assert.deepEqual(packsToShow("business"), ["starter", "business"]);
  assert.deepEqual(packsToShow("business_legacy"), ["starter", "business"]);
  assert.deepEqual(packsToShow("team"), ["starter", "team", "business"]);
  assert.deepEqual(packsToShow(null), ["starter", "business"]);
});

const good: BusinessRequestInput = {
  name: " Ada ",
  email: " ada@example.com ",
  company: " Acme ",
  licences: "8",
  billingPeriod: "annual",
  paymentMethod: "invoice",
  message: "  ",
  orgSlug: "acme",
  source: "pricing",
};

test("Business form validation: 5+ licences, work email, name and company", () => {
  assert.deepEqual(validateBusinessRequest(good), {});
  const bad = validateBusinessRequest({ ...good, name: " ", email: "nope", company: "", licences: "4" });
  assert.deepEqual(Object.keys(bad).sort(), ["company", "email", "licences", "name"]);
  assert.match(bad.licences!, /from 5 licences/);
  assert.ok(validateBusinessRequest({ ...good, licences: "5.5" }).licences);
  assert.deepEqual(validateBusinessRequest({ ...good, licences: 5 }), {});
});

test("Business form body: trimmed, numbers, empty message is null", () => {
  assert.deepEqual(businessRequestBody(good), {
    name: "Ada",
    email: "ada@example.com",
    company: "Acme",
    licences: 8,
    billing_period: "annual",
    payment_method: "invoice",
    message: null,
    org_slug: "acme",
    source: "pricing",
  });
});

test("Get started link for in-app prompts", () => {
  assert.equal(businessGetStartedHref(), BUSINESS_GET_STARTED_PATH);
  assert.equal(businessGetStartedHref({ org: "acme", from: "invite" }), "/business/get-started?org=acme&from=invite");
});
