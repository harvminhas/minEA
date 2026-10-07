import assert from "node:assert/strict";
import { test } from "node:test";
import { holdsDataLabel, readHoldsData, sensitiveKinds, suggestedHoldsData, toggleHoldsData } from "./sensitive.ts";

test("readHoldsData keeps allowed values in a fixed order and drops none next to a real kind", () => {
  assert.deepEqual(readHoldsData(["financial", "customer", "secret", "customer"]), ["customer", "financial"]);
  assert.deepEqual(readHoldsData(["none"]), ["none"]);
  assert.deepEqual(readHoldsData(["none", "employee"]), ["employee"]);
  assert.deepEqual(readHoldsData("customer"), []);
  assert.deepEqual(readHoldsData(undefined), []);
});

test("toggleHoldsData: None clears the rest, a real kind clears None, a second click unticks", () => {
  assert.deepEqual(toggleHoldsData(["customer", "financial"], "none"), ["none"]);
  assert.deepEqual(toggleHoldsData(["none"], "employee"), ["employee"]);
  assert.deepEqual(toggleHoldsData(["financial"], "customer"), ["customer", "financial"]);
  assert.deepEqual(toggleHoldsData(["customer", "financial"], "customer"), ["financial"]);
});

test("suggestedHoldsData follows the category or the platform type", () => {
  const app = (category: string) => ({ type: "application", properties: { category } });
  assert.deepEqual(suggestedHoldsData(app("CRM")), ["customer"]);
  assert.deepEqual(suggestedHoldsData(app("ERP")), ["customer", "financial"]);
  assert.deepEqual(suggestedHoldsData(app("Finance")), ["financial"]);
  assert.deepEqual(suggestedHoldsData(app("HR")), ["employee"]);
  assert.deepEqual(suggestedHoldsData(app("Collaboration")), []);
  assert.deepEqual(suggestedHoldsData({ type: "cloud_service", properties: { platform_type: "erp" } }), ["customer", "financial"]);
  assert.deepEqual(suggestedHoldsData({ type: "cloud_service", properties: { platform_type: "low_code" } }), []);
});

test("sensitiveKinds: a saved value wins over the category, and [none] means none", () => {
  const crm = { type: "application", properties: { category: "CRM" } };
  assert.deepEqual([...sensitiveKinds(crm)], ["customer"]);
  assert.deepEqual([...sensitiveKinds({ ...crm, properties: { ...crm.properties, holds_data: ["none"] } })], []);
  assert.deepEqual([...sensitiveKinds({ type: "application", properties: { category: "Collaboration", holds_data: ["financial"] } })], ["financial"]);
  assert.equal(holdsDataLabel(["customer", "financial"]), "Customer, Financial");
});
