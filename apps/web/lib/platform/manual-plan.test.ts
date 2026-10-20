import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HAND_PLANS, STRIPE_BLOCK, changeSummary, manualNote, planSummary } from "./manual-plan";

test("only Free, Starter and Business, matching the API", () => {
  assert.deepEqual([...HAND_PLANS], ["free", "starter", "business"]);
  const py = readFileSync(new URL("../../../api/app/services/manual_plan.py", import.meta.url), "utf8");
  assert.match(py, /HAND_PLANS = \("free", "starter", "business"\)/);
});

test("plan and change summaries come from the plan catalogue", () => {
  assert.equal(planSummary("free"), "1 licence · 50 apps & agents · 25 AI answers/mo");
  assert.equal(planSummary("business"), "10 licences · unlimited · 5,000 AI answers/mo");
  assert.equal(changeSummary("free", "business"), "Free → Business: licences 1 → 10, AI answers 25 → 5,000, apps & agents 50 → unlimited. Nobody loses access.");
  assert.match(changeSummary("business", "free"), /People already editing keep access/);
});

test("audit note on the row", () => {
  assert.equal(manualNote(null), "");
  assert.equal(manualNote({ by: "harvinder@bubomap.com", at: "2026-10-20T19:00:00Z", reason: "Pilot" }), "Set by hand · harvinder@bubomap.com · Oct 20, 2026 · “Pilot”");
  assert.equal(manualNote({ by: "a@b.c", at: null, reason: "" }), "Set by hand · a@b.c");
});

test("Stripe orgs see the block, not the choices; the row uses the control", () => {
  const source = readFileSync(new URL("../../components/platform/OrgPlanControl.tsx", import.meta.url), "utf8");
  assert.match(source, /org\.subscription \?/);
  assert.match(source, /STRIPE_BLOCK/);
  assert.match(STRIPE_BLOCK, /Cancel in Stripe first/);
  assert.match(source, /platformAdminApi\.setPlan/);
  const admin = readFileSync(new URL("../../components/platform/UsersAdmin.tsx", import.meta.url), "utf8");
  assert.match(admin, /<OrgPlanControl org=\{o\}/);
  assert.match(admin, /manualNote\(o\.manual\)/);
});
