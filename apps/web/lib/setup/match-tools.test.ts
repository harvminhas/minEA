import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchEntries, planHosting, SAMPLE_COMPANY, TOOL_CATALOG } from "./match-tools.ts";

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
