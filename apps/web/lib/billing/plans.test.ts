import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATALOG,
  PACK_ORDER,
  PRICE_NOTE,
  entitlementsFor,
  formatUsd,
  monthsFreeOnYearly,
  nextPackWithRoom,
  onboardingBookingUrl,
  planIncludes,
  parsePreviewPlan,
  perLicencePerMonthUsd,
  planChangeFor,
  priceLabel,
  resolveDisplayPlan,
  showsOnboarding,
  yearlyPerMonthUsd,
  yearlySavingsUsd,
} from "./plans.ts";

test("pack prices and licences match Harvinder's decisions", () => {
  assert.deepEqual(
    PACK_ORDER.map((id) => [id, CATALOG[id].licences, CATALOG[id].monthlyUsd, CATALOG[id].yearlyUsd]),
    [
      ["starter", 1, 99, 990],
      ["team", 5, 449, 4490],
      ["business", 10, 799, 7990],
    ]
  );
  assert.equal(CATALOG.free.licences, 1);
  assert.equal(CATALOG.free.monthlyUsd, 0);
  assert.equal(CATALOG.free.appsPlatforms, 25);
  assert.equal(PRICE_NOTE, "Prices in USD. Taxes may apply.");
});

test("onboarding hours only on Team and Business", () => {
  assert.deepEqual(
    ["free", "starter", "team", "business"].map((id) => CATALOG[id as keyof typeof CATALOG].onboardingHours),
    [0, 0, 4, 4]
  );
  assert.equal(showsOnboarding("team"), true);
  assert.equal(showsOnboarding("business"), true);
  assert.equal(showsOnboarding("starter"), false);
  assert.equal(showsOnboarding("free"), false);
  assert.equal(showsOnboarding("business_legacy"), false);
});

test("yearly maths: 2 months free on every pack", () => {
  assert.equal(yearlySavingsUsd(CATALOG.starter), 198);
  assert.equal(yearlySavingsUsd(CATALOG.team), 898);
  assert.equal(yearlySavingsUsd(CATALOG.business), 1598);
  for (const id of PACK_ORDER) assert.equal(monthsFreeOnYearly(CATALOG[id]), 2);
  assert.equal(monthsFreeOnYearly(CATALOG.free), 0);
  assert.equal(yearlyPerMonthUsd(CATALOG.starter), 82.5);
  assert.equal(yearlyPerMonthUsd(CATALOG.team), 374.17);
  assert.equal(yearlyPerMonthUsd(CATALOG.business), 665.83);
});

test("per-licence prices fall as packs grow", () => {
  assert.equal(perLicencePerMonthUsd(CATALOG.starter, "monthly"), 99);
  assert.equal(perLicencePerMonthUsd(CATALOG.team, "monthly"), 89.8);
  assert.equal(perLicencePerMonthUsd(CATALOG.business, "monthly"), 79.9);
  assert.equal(perLicencePerMonthUsd(CATALOG.team, "yearly"), 74.83);
});

test("price labels", () => {
  assert.equal(priceLabel(CATALOG.free, "monthly"), "$0");
  assert.equal(priceLabel(CATALOG.free, "yearly"), "$0");
  assert.equal(priceLabel(CATALOG.team, "monthly"), "$449/mo");
  assert.equal(priceLabel(CATALOG.team, "yearly"), "$4,490/yr");
  assert.equal(priceLabel(CATALOG.business, "yearly"), "$7,990/yr");
  assert.equal(formatUsd(374.17), "$374.17");
  assert.equal(formatUsd(82.5), "$82.50");
});

test("AI answer allowance is 500 per licence on packs, small on Free", () => {
  assert.equal(CATALOG.free.aiAnswersPerMonth, 25);
  for (const id of PACK_ORDER) {
    assert.equal(CATALOG[id].aiAnswersPerMonth, CATALOG[id].licences * 500);
  }
});

test("display plan: free, legacy business, future paid business", () => {
  assert.equal(resolveDisplayPlan({ plan: "free" }), "free");
  assert.equal(resolveDisplayPlan({ plan: null }), "free");
  assert.equal(resolveDisplayPlan({ plan: "nonsense" }), "free");
  assert.equal(resolveDisplayPlan({ plan: "business", hasSubscription: false }), "business_legacy");
  assert.equal(resolveDisplayPlan({ plan: "business" }), "business_legacy");
  // Old slugs the API still normalises to business are grandfathered too.
  assert.equal(resolveDisplayPlan({ plan: "team" }), "business_legacy");
  assert.equal(resolveDisplayPlan({ plan: "starter", hasSubscription: true }), "business_legacy");
  assert.equal(resolveDisplayPlan({ plan: "business", hasSubscription: true }), "business");
});

test("legacy Business keeps current limits and is labelled", () => {
  const legacy = entitlementsFor("business_legacy");
  assert.equal(legacy.label, "Business (legacy)");
  assert.equal(legacy.licences, null);
  assert.equal(legacy.aiAnswersPerMonth, null);
  assert.equal(legacy.isLegacy, true);
  assert.equal(entitlementsFor("team").licences, 5);
  assert.equal(entitlementsFor("free").isPack, false);
});

test("preview overrides the display plan only", () => {
  assert.equal(resolveDisplayPlan({ plan: "free" }, "team"), "team");
  assert.equal(resolveDisplayPlan({ plan: "business" }, "starter"), "starter");
});

test("plan changes: move freely between packs when licences fit", () => {
  assert.deepEqual(planChangeFor("free", "starter", 1), { kind: "upgrade" });
  assert.deepEqual(planChangeFor("starter", "team", 1), { kind: "upgrade" });
  assert.deepEqual(planChangeFor("business", "team", 5), { kind: "downgrade" });
  assert.deepEqual(planChangeFor("team", "starter", 1), { kind: "downgrade" });
  assert.deepEqual(planChangeFor("team", "team", 3), { kind: "current" });
  assert.deepEqual(planChangeFor("business_legacy", "team", 4), { kind: "switch" });
});

test("plan changes: blocked when more licences are in use than the pack holds", () => {
  assert.deepEqual(planChangeFor("team", "starter", 3), { kind: "blocked", unassignFirst: 2 });
  assert.deepEqual(planChangeFor("business", "team", 8), { kind: "blocked", unassignFirst: 3 });
  assert.deepEqual(planChangeFor("business_legacy", "business", 12), { kind: "blocked", unassignFirst: 2 });
});

test("next pack with room", () => {
  assert.equal(nextPackWithRoom(2, "free"), "team");
  assert.equal(nextPackWithRoom(2, "starter"), "team");
  assert.equal(nextPackWithRoom(6, "team"), "business");
  assert.equal(nextPackWithRoom(11, "business"), null);
  assert.equal(nextPackWithRoom(1), "starter");
});

test("onboarding booking URL: http(s) only, unset means coming soon", () => {
  assert.equal(onboardingBookingUrl(undefined), null);
  assert.equal(onboardingBookingUrl(""), null);
  assert.equal(onboardingBookingUrl("   "), null);
  assert.equal(onboardingBookingUrl("javascript:alert(1)"), null);
  assert.equal(onboardingBookingUrl("not a url"), null);
  assert.equal(onboardingBookingUrl("https://calendly.com/bubomap/onboarding"), "https://calendly.com/bubomap/onboarding");
});

test("preview param is ignored when the switch is off", () => {
  assert.equal(parsePreviewPlan("team", false), null);
  assert.equal(parsePreviewPlan("team", true), "team");
  assert.equal(parsePreviewPlan("TEAM ", true), "team");
  assert.equal(parsePreviewPlan("business_legacy", true), null);
  assert.equal(parsePreviewPlan("enterprise", true), null);
  assert.equal(parsePreviewPlan(null, true), null);
});

test("pricing card lines: licences, free viewers, AI and onboarding hours", () => {
  assert.deepEqual(planIncludes(CATALOG.free).slice(0, 4), [
    "1 editor",
    "Unlimited free viewers",
    "Up to 25 apps & platforms",
    "25 AI answers / month",
  ]);
  assert.equal(planIncludes(CATALOG.starter)[0], "1 licence (people who edit)");
  assert.equal(planIncludes(CATALOG.team)[0], "5 licences (people who edit)");
  assert.ok(planIncludes(CATALOG.team).includes("2,500 AI answers / month"));
  assert.ok(planIncludes(CATALOG.team).includes("4 hours of onboarding included"));
  assert.ok(planIncludes(CATALOG.business).includes("4 hours of onboarding included"));
  assert.ok(!planIncludes(CATALOG.starter).some((l) => l.includes("onboarding")));
  assert.ok(!planIncludes(CATALOG.free).some((l) => l.includes("onboarding")));
  for (const id of ["free", "starter", "team", "business"] as const) {
    assert.ok(!planIncludes(CATALOG[id]).some((l) => /contact us|talk to us|guided onboarding/i.test(l)));
  }
});
