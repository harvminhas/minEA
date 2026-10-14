import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PICKER_GROUPS, pickerGroup, pickerSections, resolveSelection, type ChainItem } from "./opening";

const item = (id: string, name: string, kind: ChainItem["kind"], derived_kind?: string, objectType?: string): ChainItem => ({
  id, name, kind, ownerTeam: "", criticality: "", description: "",
  properties: derived_kind ? { derived: true, derived_kind } : {},
  ...(objectType !== undefined ? { objectType } : {}),
});
const items = [
  item("p:aws", "AWS", "platform", "provider"),
  item("p:azure", "azure", "platform", "provider"),
  item("r1", "Azure · Canada East", "platform", "region"),
  item("r2", "Azure · Canada Central", "platform", "region"),
  item("t1", "Contoso Azure prod", "platform", undefined, "cloud_service"),
  item("t2", "contoso Azure dev", "platform", undefined, "cloud_service"),
  item("tr", "Contoso Azure prod · Canada Central", "platform", "tenant_region"),
  item("s10", "VM10", "runtime", undefined, "model"),
  item("s2", "vm2", "runtime", undefined, "model"),
  item("loc", "Toronto office", "location", undefined, "location"),
  item("pc", "People's computers", "platform", "desktop"),
  item("a1", "Teams", "application", undefined, "application"),
  item("a2", "excel", "application", undefined, "solution"),
  item("x1", "Payroll bureau", "other", undefined, "external_party"),
  item("x2", "acme Bank", "other", undefined, "external_party"),
  // Not failure points: still in the graph, never in the picker.
  item("c1", "Unknown", "other", undefined, "component"),
  item("c2", "Billing", "capability", undefined, "capability"),
  item("c3", "Invoicing", "application", undefined, "technical_capability"),
  item("c4", "Customer DB", "other", undefined, "data_store"),
  item("c5", "Nightly sync", "other", undefined, "integration_flow"),
  item("c6", "Helpdesk bot", "other", undefined, "agent"),
  item("c7", "Old ERP debt", "other", undefined, "tech_debt"),
  item("gone", "Unnamed component", "other", undefined, ""),
];
const nodes = [...items].reverse().map(({ id, name }) => ({ id, name })).concat([{ id: "orphan", name: "Unnamed item" }]);

test("picker: only failure points, fixed group order, each sorted case-insensitively and naturally", () => {
  const sections = pickerSections(nodes, items);
  assert.deepEqual(sections.map((s) => s.label), [...PICKER_GROUPS]);
  assert.ok(!PICKER_GROUPS.includes("Other" as never));
  const names = Object.fromEntries(sections.map((s) => [s.label, s.options.map((o) => o.name)]));
  assert.deepEqual(names["Providers"], ["AWS", "azure"]);
  assert.deepEqual(names["Provider · Region"], ["Azure · Canada Central", "Azure · Canada East"]);
  assert.deepEqual(names["Tenants & accounts"], ["contoso Azure dev", "Contoso Azure prod"]);
  assert.deepEqual(names["Servers & on-prem"], ["vm2", "VM10"]);
  assert.deepEqual(names["Apps"], ["excel", "Teams"]);
  assert.deepEqual(names["Outside parties"], ["acme Bank", "Payroll bureau"]);
  const offered = sections.flatMap((s) => s.options.map((o) => o.id));
  for (const id of ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "gone", "orphan"]) assert.ok(!offered.includes(id), id);
  assert.equal(offered.length, 15);
});

test("picker: empty groups are left out; the sample estate (no stored types) still groups by kind", () => {
  const few = pickerSections([{ id: "a1", name: "Teams" }, { id: "p:aws", name: "AWS" }], items);
  assert.deepEqual(few.map((s) => s.label), ["Providers", "Apps"]);
  assert.equal(pickerGroup(item("s", "SQL01", "runtime")), "Servers & on-prem");
  assert.equal(pickerGroup(item("o", "Thing", "other")), null);
  assert.equal(pickerGroup(item("k", "Cap", "capability")), null);
});

test("an excluded record opened by an old ?sel link stays visible under 'Selected'", () => {
  const sections = pickerSections(nodes, items, "c1");
  assert.deepEqual(sections.at(-1), { label: "Selected", options: [{ id: "c1", name: "Unknown" }] });
  assert.equal(pickerSections(nodes, items, "a1").at(-1)?.label, "Outside parties");
});

test("default selection is still the most impactful candidate; the dropdown uses optgroups", () => {
  const ranked = [{ id: "t1" }, { id: "p:aws" }] as never[];
  assert.equal(resolveSelection(null, ranked, new Set(["t1", "p:aws"])), "t1");
  const src = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  assert.match(src, /pickerSections\(opening\.nodes, opening\.items, opening\.selectedId\)[\s\S]{0,120}<optgroup key=\{section\.label\} label=\{section\.label\}>/);
  assert.match(src, /objectType: stored\.get\(node\.id\) \?\? ""/);
});
