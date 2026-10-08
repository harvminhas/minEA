import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CATALOG, PACK_ORDER, PLAN_ORDER, resolveDisplayPlan } from "./plans.ts";
import { LEGACY_PLAN_MAP, PAID_PLANS, isPaidPlan, normalizePlan } from "../plan-features.ts";

/** The API's canonical catalogue; the Python side has tests/test_plans_parity.py. */
const plansJson = JSON.parse(
  readFileSync(new URL("../../../api/app/services/plans.json", import.meta.url), "utf8")
) as {
  currency: string;
  plans: Record<
    string,
    {
      label: string;
      licences: number;
      monthly_usd: number;
      yearly_usd: number;
      ai_answers_per_month: number;
      apps_platforms: number | null;
      onboarding_hours: number;
    }
  >;
  pack_order: string[];
  legacy_aliases: Record<string, string>;
};

test("plan keys and pack order match plans.json", () => {
  assert.deepEqual(Object.keys(plansJson.plans), PLAN_ORDER);
  assert.deepEqual(plansJson.pack_order, PACK_ORDER);
  assert.deepEqual(PAID_PLANS, PACK_ORDER);
  assert.equal(plansJson.currency, "usd");
});

test("every catalogue number matches plans.json", () => {
  for (const id of PLAN_ORDER) {
    const api = plansJson.plans[id];
    const web = CATALOG[id];
    assert.deepEqual(
      {
        label: web.label,
        licences: web.licences,
        monthly: web.monthlyUsd,
        yearly: web.yearlyUsd,
        ai: web.aiAnswersPerMonth,
        apps: web.appsPlatforms,
        onboarding: web.onboardingHours,
      },
      {
        label: api.label,
        licences: api.licences,
        monthly: api.monthly_usd,
        yearly: api.yearly_usd,
        ai: api.ai_answers_per_month,
        apps: api.apps_platforms,
        onboarding: api.onboarding_hours,
      },
      id
    );
  }
});

test("legacy aliases match and packs are no longer folded into business", () => {
  assert.deepEqual(LEGACY_PLAN_MAP, plansJson.legacy_aliases);
  // Same cases as test_normalize_plan_keeps_packs_distinct in the API.
  const cases: [string | null | undefined, string][] = [
    [null, "free"],
    ["", "free"],
    ["free", "free"],
    ["starter", "starter"],
    ["team", "team"],
    ["business", "business"],
    ["Business", "business"],
    ["solo", "business"],
    ["growth", "business"],
    ["enterprise", "free"],
  ];
  for (const [raw, expected] of cases) assert.equal(normalizePlan(raw), expected, String(raw));
});

test("every pack is a paid plan; free is not", () => {
  for (const id of PACK_ORDER) assert.equal(isPaidPlan(id), true);
  assert.equal(isPaidPlan("free"), false);
  assert.equal(isPaidPlan("solo"), true);
});

test("display plan matches the API's display_plan rule", () => {
  // Same cases as test_display_plan_grandfathering in the API.
  const cases: [string, boolean, string][] = [
    ["free", false, "free"],
    ["business", false, "business_legacy"],
    ["solo", false, "business_legacy"],
    ["business", true, "business"],
    ["team", true, "team"],
    ["starter", true, "starter"],
  ];
  for (const [plan, hasSubscription, expected] of cases) {
    assert.equal(resolveDisplayPlan({ plan, hasSubscription }), expected, `${plan}/${hasSubscription}`);
  }
});
