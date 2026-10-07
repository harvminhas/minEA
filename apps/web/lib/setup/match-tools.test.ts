import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { setupCreate } from "./add-plan.ts";
import { isSetupApp, matchEntries, planHosting, SAMPLE_COMPANY, setupMatch, TOOL_CATALOG } from "./match-tools.ts";

describe("tool matcher", () => {
  const harbor = matchEntries(SAMPLE_COMPANY);

  it("matches the sample company without saving anything", () => {
    assert.equal(harbor.length, 8);
    const byName = Object.fromEntries(harbor.map((item) => [item.input.toLowerCase(), item]));
    assert.equal(byName.salesforce?.status, "matched");
    assert.equal(byName.salesforce?.tool?.name, "Salesforce");
    assert.equal(byName.quickbooks?.tool?.name, "QuickBooks Online");
    assert.equal(byName.m365?.tool?.name, "Microsoft 365");
    assert.equal(byName.shopify?.tool?.name, "Shopify");
    assert.equal(byName.as400?.tool?.kind, "server");
    assert.equal(byName["order entry"]?.status, "custom");
    assert.equal(byName.edi?.status, "pick");
    assert.equal(byName["label printing"]?.status, "weak");
    assert.equal(byName["label printing"]?.tool?.name, "BarTender");
    assert.equal(byName.as400?.status, "matched");
    assert.equal(harbor.filter((item) => item.status === "matched" && item.tool?.kind === "app").length, 4);
    assert.equal(harbor.filter((item) => item.tool?.kind === "server").length, 1);
  });

  it("matches Slack to its own vendor and cost", () => {
    const item = matchEntries("Slack")[0];
    assert.equal(item?.tool?.name, "Slack");
    assert.equal(item?.tool?.typicalAnnual, 900);
    const salesforce = TOOL_CATALOG.find((tool) => tool.name === "Salesforce");
    assert.notEqual(item?.tool?.typicalAnnual, salesforce?.typicalAnnual);
    assert.equal(
      TOOL_CATALOG.some(
        (tool) => tool.name !== "Slack" && tool.vendor === item?.tool?.vendor && tool.typicalAnnual === item?.tool?.typicalAnnual,
      ),
      false,
    );
  });

  it("offers Cleo with the other EDI tools", () => {
    const names = matchEntries("EDI")[0]?.options.map((option) => option.name) ?? [];
    assert.ok(names.includes("SPS Commerce"));
    assert.ok(names.includes("TrueCommerce"));
    assert.ok(names.includes("Cleo"));
  });

  it("collapses duplicates", () => {
    assert.equal(matchEntries("Salesforce, salesforce, Salesforce").length, 1);
  });

  it("setup creates an exact platform as a cloud service and leaves AWS and Azure typed", () => {
    const rows = setupMatch("AWS, Azure, Snowflake, HubSpot, AWS Lambda");
    for (const name of ["AWS", "Azure"]) {
      const row = rows.find((item) => item.input === name);
      assert.equal(row?.status, "custom", name);
      assert.equal(row?.tool, null, name);
      assert.equal(row?.input, name);
      assert.equal(setupCreate(row!)?.type, "application", name);
    }
    const snowflake = rows.find((item) => item.input === "Snowflake");
    assert.equal(snowflake?.status, "matched");
    assert.equal(snowflake?.tool?.kind, "platform");
    assert.equal(isSetupApp(snowflake!), false);
    const created = setupCreate(snowflake!);
    assert.equal(created?.type, "cloud_service");
    assert.equal(created?.name, "Snowflake");
    assert.equal(created?.properties.vendor, "Snowflake");
    assert.equal(created?.properties.category, "Analytics");
    assert.equal(created?.properties.hosting_model, "saas");
    assert.equal(created?.properties.platform_type, undefined);
    const lambda = setupCreate(rows.find((item) => item.input === "AWS Lambda")!);
    assert.equal(lambda?.type, "cloud_service");
    assert.equal(lambda?.properties.vendor, "Amazon");
    assert.equal(lambda?.properties.category, "Infrastructure");
    assert.equal(lambda?.properties.hosting_model, "paas");
    assert.equal(lambda?.properties.platform_type, undefined);
    assert.equal(rows.find((item) => item.input === "HubSpot")?.tool?.kind, "app");
  });

  it("an app match never returns a platform tool", () => {
    for (const tool of TOOL_CATALOG.filter((item) => item.kind === "platform")) {
      const row = matchEntries(tool.name, "app")[0];
      assert.equal(row?.tool, null, tool.name);
      assert.equal(row?.status, "custom", tool.name);
    }
  });

  it("Dynamics 365 does not match Microsoft 365", () => {
    const row = matchEntries("Dynamics 365", "app")[0];
    assert.equal(row?.input, "Dynamics 365");
    assert.equal(row?.tool, null);
    assert.equal(row?.status, "custom");
    assert.equal(matchEntries("Microsoft 365", "app")[0]?.tool?.name, "Microsoft 365");
    assert.equal(matchEntries("ms 365", "app")[0]?.tool?.name, "Microsoft 365");
  });

  it("tools.json equals TOOL_CATALOG", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "../catalog/tools.json");
    const json = JSON.parse(readFileSync(path, "utf8")) as unknown;
    assert.deepEqual(json, TOOL_CATALOG);
  });

  it("shares one server across apps", () => {
    const plan = planHosting(
      [
        { key: "a", name: "Order Entry", choice: "own", serverName: "AS400" },
        { key: "b", name: "EDI", choice: "own", serverName: "as400" },
        { key: "c", name: "Label printing", choice: "unknown", serverName: "" },
      ],
      { as400: "Main plant" },
    );
    assert.equal(plan.servers.length, 1);
    assert.equal(plan.links.length, 2);
    assert.equal(plan.servers[0]?.where, "Main plant");
  });
});
