import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_SETUP_TIMEOUT_MS,
  STILL_SETTING_UP_BODY,
  STILL_SETTING_UP_TITLE,
  checkoutPhase,
  parseCheckoutSessionId,
  supportRequestBody,
} from "./support.ts";

test("checkout phase: confirming, then still setting up after ~60s, active as soon as the plan shows", () => {
  assert.equal(CHECKOUT_SETUP_TIMEOUT_MS, 60_000);
  assert.equal(checkoutPhase(0, false), "confirming");
  assert.equal(checkoutPhase(59_999, false), "confirming");
  assert.equal(checkoutPhase(60_000, false), "still_setting_up");
  assert.equal(checkoutPhase(5_000, true), "active");
  assert.equal(checkoutPhase(600_000, true), "active");
});

test("still setting up copy is calm, mentions the Stripe receipt, no repeat payment", () => {
  assert.equal(STILL_SETTING_UP_TITLE, "Payment received, still setting up your plan");
  assert.match(STILL_SETTING_UP_BODY, /Stripe has emailed you a receipt/);
  assert.match(STILL_SETTING_UP_BODY, /no need to pay again/);
  assert.doesNotMatch(STILL_SETTING_UP_BODY, /error|failed|!/i);
});

test("checkout session ids: Stripe shape only", () => {
  assert.equal(parseCheckoutSessionId("cs_live_a1B2c3D4e5F6"), "cs_live_a1B2c3D4e5F6");
  assert.equal(parseCheckoutSessionId(" cs_test_abcdef "), "cs_test_abcdef");
  assert.equal(parseCheckoutSessionId("{CHECKOUT_SESSION_ID}"), null);
  assert.equal(parseCheckoutSessionId("cs_<script>"), null);
  assert.equal(parseCheckoutSessionId(null), null);
});

test("support body: trimmed, session validated, no org or email (the API takes those from the session)", () => {
  assert.deepEqual(supportRequestBody({ topic: "billing", message: "  Paid  ", checkoutSessionId: "cs_test_abcdef", source: "checkout" }), {
    topic: "billing",
    message: "Paid",
    checkout_session_id: "cs_test_abcdef",
    source: "checkout",
  });
  assert.equal(supportRequestBody({ topic: "bug", message: "x", checkoutSessionId: "nope" }).checkout_session_id, null);
});

test("app user menu has a Help item that opens the support form", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/nav/TopNav.tsx", import.meta.url), "utf8");
  assert.match(src, /data-testid="user-menu-help"/);
  assert.match(src, /<SupportDialog orgSlug=\{orgSlug\} source="menu"/);
});
