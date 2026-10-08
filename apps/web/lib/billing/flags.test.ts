import assert from "node:assert/strict";
import { test } from "node:test";
import { billingPreviewEnabled, billingUiEnabled } from "./flags.ts";

test("billing UI is on in local dev and off in production unless set", () => {
  assert.equal(billingUiEnabled({ nodeEnv: "development" }), true);
  assert.equal(billingUiEnabled({ nodeEnv: "production" }), false);
  assert.equal(billingUiEnabled({ nodeEnv: "production", flag: "" }), false);
  assert.equal(billingUiEnabled({ nodeEnv: "production", flag: "1" }), true);
  assert.equal(billingUiEnabled({ nodeEnv: "production", flag: "true" }), true);
  assert.equal(billingUiEnabled({ nodeEnv: "development", flag: "0" }), false);
  assert.equal(billingUiEnabled({ nodeEnv: "development", flag: "off" }), false);
  assert.equal(billingUiEnabled({ nodeEnv: "production", flag: "maybe" }), false);
});

test("plan preview switch is never on in production", () => {
  assert.equal(billingPreviewEnabled({ nodeEnv: "production" }), false);
  assert.equal(billingPreviewEnabled({ nodeEnv: "production", flag: "1" }), false);
  assert.equal(billingPreviewEnabled({ nodeEnv: "development" }), true);
  assert.equal(billingPreviewEnabled({ nodeEnv: "development", flag: "0" }), false);
});
