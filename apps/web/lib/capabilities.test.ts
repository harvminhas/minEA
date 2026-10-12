import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import rules from "../../../packages/types/src/relationship-rules.json";
import { REGISTRY } from "./fields/registry.ts";
import {
  NO_CAPABILITY,
  appCapabilityIndex,
  capabilityFilterOptions,
  capabilityRows,
  domainSuggestions,
  draftFromApps,
  draftPlan,
  groupByDomain,
  matchesCapabilityFilter,
  resolveDomain,
  type CapEdge,
  type CapObject,
} from "./capabilities.ts";

const o = (id: string, type: string, name: string, properties: Record<string, unknown> = {}, extra: Partial<CapObject> = {}): CapObject => ({ id, type, name, status: "active", properties, ...extra });
const sell = o("d1", "business_domain", "Sell");
const crmCap = o("c1", "capability", "Customer relationship management", { domain_id: "d1" }, { owner_team_name: "Sales" });
const books = o("c2", "capability", "Bookkeeping");
const sf = o("a1", "application", "Salesforce");
const qb = o("a2", "application", "QuickBooks Online");
const m365 = o("p1", "cloud_service", "Microsoft 365");
const gusto = o("a3", "application", "Our HR tool", { category: "HR" });
const edges: CapEdge[] = [{ type: "supported_by", from_object_id: "c1", to_object_id: "a1" }];
const all = [sell, crmCap, books, sf, qb, m365, gusto];

test("capability record has Supported by (apps and platforms) and an optional Domain", () => {
  const fields = REGISTRY.capability.map((def) => def.key);
  assert.deepEqual(fields.slice(0, 3), ["name", "supported_by", "domain"]);
  const supported = REGISTRY.capability.find((def) => def.key === "supported_by")!;
  assert.deepEqual(supported.source, { kind: "rel", edge: "supported_by", dir: "out", target: ["application", "cloud_service", "solution", "technical_capability"], single: false });
  const triples = new Set((rules as string[][]).map((rule) => rule.join("|")));
  for (const target of ["application", "cloud_service"]) assert.ok(triples.has(`supported_by|capability|${target}`));
  assert.ok(!REGISTRY.capability.find((def) => def.key === "domain")!.required);
});

test("list rows: domain grouping, supported by, owner and gaps", () => {
  const rows = capabilityRows(all, edges);
  assert.deepEqual(rows.map((row) => [row.name, row.domain, row.owner, row.supportedBy.map((s) => s.name), row.gap]), [
    ["Bookkeeping", "", "", [], true],
    ["Customer relationship management", "Sell", "Sales", ["Salesforce"], false],
  ]);
  assert.deepEqual(groupByDomain(rows).map((group) => [group.domain, group.rows.length]), [["Sell", 1], ["No domain", 1]]);
});

test("domain is free text with suggestions: known names reuse the record, new names create one, blank clears", () => {
  assert.deepEqual(resolveDomain("  sell ", all), { id: "d1" });
  assert.deepEqual(resolveDomain("Back office", all), { create: "Back office" });
  assert.deepEqual(resolveDomain("", all), { clear: true });
  const suggestions = domainSuggestions(all);
  assert.equal(suggestions[0], "Sell");
  assert.equal(suggestions.filter((name) => name === "Sell").length, 1);
});

test("Draft from my apps suggests capabilities pre-linked to existing apps and skips links that exist", () => {
  const drafts = draftFromApps(all, edges);
  assert.deepEqual(drafts.map((d) => [d.name, d.domain, d.appIds, d.existingId ?? null]), [
    ["Accounting", "Finance", ["a2"], null],
    ["Team communication", "IT", ["p1"], null],
    ["Payroll & HR", "People", ["a3"], null],
  ]);
  const withSecondCrm = draftFromApps([...all, o("a4", "application", "HubSpot")], edges);
  const crm = withSecondCrm.find((d) => d.name === "Customer relationship management")!;
  assert.deepEqual([crm.appIds, crm.existingId], [["a4"], "c1"]);
});

test("confirming a draft creates missing domains, then one batch of capabilities and supported_by links", () => {
  const drafts = draftFromApps([...all, o("a4", "application", "HubSpot")], edges);
  const plan = draftPlan(drafts, all);
  assert.deepEqual(plan.domainsToCreate, ["Finance", "IT", "People"]);
  const batch = plan.batch(new Map([["finance", "dF"], ["it", "dI"], ["people", "dP"]]));
  assert.deepEqual(batch.creates.map((c) => [c.name, c.properties]), [
    ["Accounting", { domain_id: "dF" }],
    ["Team communication", { domain_id: "dI" }],
    ["Payroll & HR", { domain_id: "dP" }],
  ]);
  assert.ok(batch.relationships.some((r) => r.from_id === "c1" && r.to_id === "a4" && r.to_type === "application"));
  assert.ok(batch.relationships.some((r) => r.from_key === "team communication" && r.to_id === "p1" && r.to_type === "cloud_service"));
});

test("Applications list: Capabilities column and filter", () => {
  const index = appCapabilityIndex(all, edges);
  assert.deepEqual(index.get("a1"), ["Customer relationship management"]);
  assert.deepEqual(capabilityFilterOptions(all), ["Any capability", NO_CAPABILITY, "Bookkeeping", "Customer relationship management"]);
  assert.equal(matchesCapabilityFilter([], NO_CAPABILITY), true);
  assert.equal(matchesCapabilityFilter(["Bookkeeping"], "Bookkeeping"), true);
  assert.equal(matchesCapabilityFilter(["Bookkeeping"], "Customer relationship management"), false);
  const screen = readFileSync(new URL("../components/mvp/ModelScreen.tsx", import.meta.url), "utf8");
  assert.match(screen, /"Capabilities"/);
  assert.match(screen, /<CapabilitiesSection/);
});

test("empty state offers a template and a draft; neither saves before confirm", () => {
  const src = readFileSync(new URL("../components/mvp/CapabilitiesSection.tsx", import.meta.url), "utf8");
  assert.match(src, /Start from a template/);
  assert.match(src, /Draft from my apps/);
  assert.match(src, /adoptTemplate/);
  assert.match(src, /capability-template-confirm/);
  assert.match(src, /capability-draft-confirm/);
});
