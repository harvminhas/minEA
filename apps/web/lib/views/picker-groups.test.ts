import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PICKER_GROUPS, pickerSections, resolveSelection, type ChainItem } from "./opening";

const item = (id: string, name: string, kind: ChainItem["kind"], derived_kind?: string): ChainItem => ({
  id, name, kind, ownerTeam: "", criticality: "", description: "", properties: derived_kind ? { derived: true, derived_kind } : {},
});
const items = [
  item("p:aws", "AWS", "platform", "provider"),
  item("p:azure", "azure", "platform", "provider"),
  item("r1", "Azure · Canada East", "platform", "region"),
  item("r2", "Azure · Canada Central", "platform", "region"),
  item("t1", "Contoso Azure prod", "platform"),
  item("t2", "contoso Azure dev", "platform"),
  item("tr", "Contoso Azure prod · Canada Central", "platform", "tenant_region"),
  item("s10", "VM10", "runtime"),
  item("s2", "vm2", "runtime"),
  item("loc", "Toronto office", "location"),
  item("pc", "People's computers", "platform", "desktop"),
  item("a1", "Teams", "application"),
  item("a2", "excel", "application"),
];
const nodes = [...items].reverse().map(({ id, name }) => ({ id, name })).concat([{ id: "x", name: "Orphan node" }]);

test("picker: fixed group order, empty groups left out, each sorted case-insensitively and naturally", () => {
  const sections = pickerSections(nodes, items);
  assert.deepEqual(sections.map((s) => s.label), [...PICKER_GROUPS]);
  const names = Object.fromEntries(sections.map((s) => [s.label, s.options.map((o) => o.name)]));
  assert.deepEqual(names["Providers"], ["AWS", "azure"]);
  assert.deepEqual(names["Provider · Region"], ["Azure · Canada Central", "Azure · Canada East"]);
  assert.deepEqual(names["Tenants & accounts"], ["contoso Azure dev", "Contoso Azure prod"]);
  assert.deepEqual(names["Servers & on-prem"], ["vm2", "VM10"]);
  assert.deepEqual(names["Apps"], ["excel", "Teams"]);
  assert.deepEqual(names["Other"], ["Orphan node"]);
  const few = pickerSections([{ id: "a1", name: "Teams" }, { id: "p:aws", name: "AWS" }], items);
  assert.deepEqual(few.map((s) => s.label), ["Providers", "Apps"]);
});

test("default selection is still the most impactful candidate; the dropdown uses optgroups", () => {
  const ranked = [{ id: "t1" }, { id: "p:aws" }] as never[];
  assert.equal(resolveSelection(null, ranked, new Set(["t1", "p:aws"])), "t1");
  const src = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  assert.match(src, /pickerSections\(opening\.nodes, opening\.items\)[\s\S]{0,120}<optgroup key=\{section\.label\} label=\{section\.label\}>/);
});
