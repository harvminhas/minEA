import { test } from "node:test";
import assert from "node:assert/strict";
import type { MinEAObject, Relationship } from "@minea/types";
import type { VendorContract } from "./contracts";
import { shapeCatalog } from "./use-model-catalog";
import { catalogToolFor, displayVendorName, knownVendorSuggestions, normalizeVendor, vendorKey, vendorProducts, vendorSummaries } from "./vendors";

const obj = (id: string, name: string, properties: Record<string, unknown> = {}, type = "application") =>
  ({ id, type, name, status: "active", properties }) as unknown as MinEAObject;
const rel = (id: string, type: string, from: string, to: string) => ({ id, type, from_object_id: from, to_object_id: to }) as unknown as Relationship;
const tools = [
  { name: "Microsoft 365", aliases: ["M365", "Office 365"], vendor: "Microsoft" },
  { name: "Microsoft Intune", aliases: ["Intune"], vendor: "Microsoft Corporation" },
  { name: "GitHub", aliases: [], vendor: "GitHub, Inc." },
  { name: "Slack", aliases: [], vendor: "Salesforce" },
  { name: "Jira", aliases: [], vendor: "Atlassian" },
];

test("vendor names normalize and brands roll up to the parent", () => {
  assert.equal(normalizeVendor("Microsoft Corporation"), "microsoft");
  assert.equal(normalizeVendor("Salesforce, Inc."), "salesforce");
  assert.equal(vendorKey("GitHub, Inc."), "microsoft");
  assert.equal(vendorKey("Slack"), "salesforce");
  assert.equal(displayVendorName("Microsoft Corporation"), "Microsoft");
  assert.equal(displayVendorName("Okta, Inc."), "Okta");
});

test("catalog products per vendor: in use vs other products they sell", () => {
  const p = vendorProducts("microsoft", tools, [{ name: "M365" }, { name: "Billing" }]);
  assert.deepEqual(p.inUse.map((t) => t.name), ["Microsoft 365"]);
  assert.deepEqual(p.other.map((t) => t.name), ["Microsoft Intune", "GitHub"]);
  assert.equal(catalogToolFor("office 365", tools)?.name, "Microsoft 365");
});

test("summaries: one row per company, spend once, share, risk badges, supplied_by links", () => {
  const objects = [
    obj("ms", "Microsoft Corporation", {}, "external_party"),
    obj("m365", "Microsoft 365", { vendor: "Microsoft", criticality: "critical" }),
    obj("azure", "Azure", { vendor: "Microsoft", criticality: "critical" }),
    obj("gh", "GitHub", { vendor: "GitHub", annual_cost: 18_400 }),
    obj("entra", "Entra ID", { criticality: "critical" }),
    obj("sap", "S/4HANA", { vendor: "SAP", annual_cost: 210_000, criticality: "critical" }),
    obj("okta", "Okta WI", { vendor: "Okta", annual_cost: 38_000 }),
    obj("cap", "Identity", {}, "capability"),
    obj("idle", "Unused", {}, "external_party"),
  ];
  const rels = [rel("r1", "supplied_by", "entra", "ms"), rel("r2", "supported_by", "cap", "entra"), rel("r3", "supported_by", "cap", "okta")];
  const contract: VendorContract = {
    id: "k1", vendor_id: "ms", vendor_name: "Microsoft Corporation", name: "EA", annual_cost_cents: 46_800_000, start_date: null,
    end_date: "2026-11-30", notice_days: 30, auto_renew: true, owner_contact_id: null, document_url: null,
    items: [{ object_id: "m365", seats: null, in_use: null }, { object_id: "azure", seats: null, in_use: null }, { object_id: "entra", seats: null, in_use: null }],
  };
  const unattached: VendorContract = { ...contract, id: "k2", name: "Support", annual_cost_cents: 1_000_000, items: [], end_date: null };
  const shaped = shapeCatalog({ objects, relationships: rels, contracts: [contract, unattached] });
  const list = vendorSummaries({ rows: shaped.rows, objects, effective: shaped.effective, relationships: shaped.relationships, contracts: shaped.contracts, now: new Date(2026, 9, 24) });
  const ms = list[0];
  assert.equal(ms.name, "Microsoft Corporation");
  assert.equal(ms.partyId, "ms");
  assert.equal(ms.spend, 468_000 + 18_400 + 10_000);
  assert.deepEqual(ms.apps.map((a) => a.name).sort(), ["Azure", "Entra ID", "GitHub", "Microsoft 365"]);
  assert.equal(ms.critical.length, 3);
  assert.deepEqual(ms.badges.map((b) => b.kind), ["concentration", "overlap"]);
  assert.equal(ms.renewal?.days, 37);
  const sap = list.find((v) => v.key === "sap")!;
  assert.deepEqual(sap.badges.map((b) => b.label), ["Single critical app"]);
  const okta = list.find((v) => v.key === "okta")!;
  assert.deepEqual(okta.badges.map((b) => b.label), ["Overlap: Okta WI ↔ Entra ID"]);
  assert.ok(list.find((v) => v.partyId === "idle"), "a new vendor with nothing filled in still lists");
  const total = list.reduce((s, v) => s + v.spend, 0);
  assert.equal(total, 468_000 + 18_400 + 10_000 + 210_000 + 38_000);
  assert.ok(Math.abs(list.reduce((s, v) => s + v.share, 0) - 1) < 1e-9);
});

test("suggestions: apps with no vendor that match a known product", () => {
  const objects = [obj("a", "Slack"), obj("b", "Jira", { vendor: "Atlassian" }), obj("c", "Home-grown"), obj("d", "Github")];
  const shaped = shapeCatalog({ objects, relationships: [] });
  assert.deepEqual(knownVendorSuggestions(shaped.rows, [], tools).map((s) => `${s.row.name}->${s.vendor}`), ["Slack->Salesforce", "Github->Microsoft"]);
  assert.equal(knownVendorSuggestions(shaped.rows, [rel("x", "supplied_by", "a", "p")], tools).length, 1);
});
