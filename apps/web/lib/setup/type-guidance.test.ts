import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_OR_PLATFORM, askListKind, nextPreset, typeGuidance } from "./type-guidance.ts";

test("the guidance line names applications and platforms", () => {
  assert.match(APP_OR_PLATFORM, /HubSpot, QuickBooks/);
  assert.match(APP_OR_PLATFORM, /Azure, Salesforce Platform, VMware/);
});

test("a catalog match preselects the type, and two-sided products offer both", () => {
  const hubspot = typeGuidance("HubSpot");
  assert.equal(hubspot.mode, "suggest");
  if (hubspot.mode === "suggest") assert.equal(hubspot.line, "We think this is an Application");
  const azure = typeGuidance("Azure");
  assert.equal(azure.mode, "suggest");
  if (azure.mode === "suggest") {
    assert.equal(azure.kind, "platform");
    assert.equal(azure.line, "We think this is a Platform");
  }
  for (const name of ["Salesforce", "Microsoft 365", "Dynamics 365"]) {
    const both = typeGuidance(name);
    assert.equal(both.mode, "both", name);
    if (both.mode === "both") {
      assert.deepEqual(both.options.map((option) => option.kind), ["app", "platform"]);
      assert.equal(both.options.length, 2);
      assert.ok(both.options.every((option) => option.hint.length > 0));
    }
  }
});

test("vendor Oracle stays a vendor and Toronto office stays a location", () => {
  assert.equal(typeGuidance("Oracle").mode, "none");
  assert.equal(typeGuidance("Toronto office").mode, "none");
  assert.equal(nextPreset("vendor", "Oracle", false), "vendor");
  assert.equal(nextPreset("location", "Toronto office", false), "location");
  assert.equal(nextPreset("server", "Azure", false), "server");
  assert.equal(nextPreset("app", "AS400", false), "app");
  assert.equal(nextPreset("app", "Azure", false), "platform");
});

test("catalog platforms are suggested by their exact name", () => {
  for (const name of ["Snowflake", "Azure Functions", "Databricks", "Microsoft Fabric", "AWS Lambda", "Azure AI Foundry", "Copilot Studio", "Bedrock", "Vertex AI"]) {
    const guidance = typeGuidance(name);
    assert.equal(guidance.mode, "suggest", name);
    if (guidance.mode === "suggest") assert.equal(guidance.kind, "platform", name);
  }
});

test("a manual chip choice is never overridden", () => {
  assert.equal(nextPreset("app", "Azure", true), "app");
  assert.equal(nextPreset("platform", "HubSpot", true), "platform");
  assert.equal(nextPreset("vendor", "HubSpot", true), "vendor");
});

test("a list of platform names is a platform add", () => {
  assert.equal(askListKind("AWS, Azure"), "platform");
  assert.equal(askListKind("Snowflake"), "platform");
  assert.equal(askListKind("HubSpot, Snowflake"), "app");
});
