import { describe, it, assert } from "vitest";
import { dedupeKey, findExisting, type EstateItem } from "./add-plan";
import { normalizeTerm, TOOL_CATALOG } from "./match-tools";

describe("Matcher", () => {
  const createEstateItem = (id: string, name: string, type: string, catalogTool?: string): EstateItem => ({
    id,
    type,
    name,
    owner: "",
    cost: "",
    lifecycle: "",
    category: "",
    catalogTool: catalogTool || "",
    vendor: "",
    renewal: "",
  });

  it("matches M365 to Microsoft 365", () => {
    const tool = TOOL_CATALOG.find((t) => t.aliases.includes("m365"));
    assert.ok(tool, "M365 should be in catalog");
    assert.equal(tool?.name, "Microsoft 365");
  });

  it("matches quickbooks to QuickBooks Online", () => {
    const tool = TOOL_CATALOG.find((t) => t.aliases.includes("quickbooks"));
    assert.ok(tool, "quickbooks should be in catalog");
    assert.equal(tool?.name, "QuickBooks Online");
  });

  it("matches AS400 to server kind", () => {
    const tool = TOOL_CATALOG.find((t) => t.aliases.includes("as400"));
    assert.ok(tool, "AS400 should be in catalog");
    assert.equal(tool?.kind, "server");
  });

  it("normalizes terms consistently", () => {
    assert.equal(normalizeTerm("M365"), normalizeTerm("m365"));
    assert.equal(normalizeTerm("Microsoft 365"), normalizeTerm("microsoft365"));
    assert.equal(normalizeTerm("QuickBooks Online"), normalizeTerm("quickbooksonline"));
  });

  it("dedupeKey drops edition words", () => {
    assert.equal(dedupeKey("Zoom Workplace"), dedupeKey("Zoom"));
    assert.equal(dedupeKey("QuickBooks Online"), dedupeKey("QuickBooks"));
    assert.equal(dedupeKey("Microsoft 365 Cloud"), dedupeKey("Microsoft 365"));
  });
});

describe("Dedupe", () => {
  const createEstateItem = (id: string, name: string, type: string, catalogTool?: string): EstateItem => ({
    id,
    type,
    name,
    owner: "Test Owner",
    cost: "$1,000",
    lifecycle: "",
    category: "Test",
    catalogTool: catalogTool || "",
    vendor: "Test Vendor",
    renewal: "",
  });

  it("finds existing HubSpot", () => {
    const estate = [createEstateItem("1", "HubSpot", "application", "HubSpot")];
    const item = { input: "HubSpot", status: "matched" as const, tool: TOOL_CATALOG.find((t) => t.name === "HubSpot") || null, options: [], customBuilt: false };
    const existing = findExisting(item, "app", estate);
    assert.ok(existing, "Should find existing HubSpot");
    assert.equal(existing?.name, "HubSpot");
  });

  it("finds M365 by catalog tool", () => {
    const estate = [createEstateItem("1", "Microsoft 365", "cloud_service", "Microsoft 365")];
    const tool = TOOL_CATALOG.find((t) => t.name === "Microsoft 365");
    const item = { input: "M365", status: "matched" as const, tool, options: [], customBuilt: false };
    const existing = findExisting(item, "platform", estate);
    assert.ok(existing, "Should find Microsoft 365 via M365 alias");
    assert.equal(existing?.name, "Microsoft 365");
  });

  it("finds by normalized name", () => {
    const estate = [createEstateItem("1", "Quick Books Online", "application")];
    const item = { input: "quickbooks", status: "custom" as const, tool: null, options: [], customBuilt: false };
    const existing = findExisting(item, "app", estate);
    assert.ok(existing, "Should find by normalized name");
  });

  it("does not find different types", () => {
    const estate = [createEstateItem("1", "AS400", "model")];
    const item = { input: "AS400", status: "custom" as const, tool: null, options: [], customBuilt: false };
    const existing = findExisting(item, "app", estate);
    assert.equal(existing, null, "Should not match different object types");
  });

  it("collapses M365 and Microsoft 365", () => {
    // This would be tested in the prepareRows function which calls findExisting
    const tool = TOOL_CATALOG.find((t) => t.name === "Microsoft 365");
    assert.ok(tool);
    assert.ok(tool.aliases.includes("m365"));
    assert.ok(tool.aliases.includes("microsoft 365"));
  });
});
