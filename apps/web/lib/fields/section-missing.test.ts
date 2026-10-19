import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { MinEAObject } from "@minea/types";
import { REGISTRY, recordTypeOf, type FieldDef, type Section } from "./registry.ts";
import { countMissing, missingBySection } from "./section-missing.ts";
import { COLLAPSED_SECTIONS_KEY, readCollapsed, toggleCollapsed, writeCollapsed } from "./collapsed-sections.ts";
import { rowFromObject } from "../model-catalog.ts";

const at = "2026-10-01T12:00:00Z";
const obj = (type: string, extra: Partial<MinEAObject> = {}): MinEAObject =>
  ({ id: `id-${type}`, type, name: "Abnormal", properties: {}, tags: [], status: "", created_at: at, updated_at: at, workspace_id: "w", org_id: "o", ...extra }) as MinEAObject;

// Same grouping RecordFields does: registry order, omitted and hidden fields left out.
function groupsFor(object: MinEAObject, omit: string[] = []) {
  const type = recordTypeOf(object.type)!;
  const groups: { section: Section; fields: FieldDef[] }[] = [];
  for (const def of REGISTRY[type]) {
    if (omit.includes(def.key)) continue;
    if (def.showIf && !def.showIf({ properties: (object.properties ?? {}) as Record<string, unknown>, type: object.type })) continue;
    const group = groups.find((item) => item.section === def.section);
    if (group) group.fields.push(def);
    else groups.push({ section: def.section, fields: [def] });
  }
  return { type, groups };
}

const samples: MinEAObject[] = [
  obj("application"),
  obj("application", { status: "active", properties: { category: "Security", vendor: "Abnormal", contract_renewal: "2026-12-07" } }),
  obj("application", { owner_team_name: "Security", status: "active", properties: { criticality: "high" } }),
  obj("solution"),
  obj("model"),
  obj("model", { properties: { lifecycle: "active", commitment_ends: "2027-01-01", vendor: "Dell" } }),
  obj("cloud_service"),
  obj("cloud_service", { properties: { lifecycle: "active", criticality: "low" } }),
];

test("section 'missing' hints add up to the header badge for every record kind", () => {
  for (const object of samples) {
    const row = rowFromObject(object)!;
    assert.equal(row.missingCount, countMissing(row.missing));
    for (const omit of [["name"], ["name", "owner"], ["name", "criticality", "vendor"]]) {
      const { type, groups } = groupsFor(object, omit);
      const counts = missingBySection(row.missing, groups, REGISTRY[type]);
      const sum = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
      assert.equal(sum, row.missingCount, `${object.type} ${JSON.stringify(object.properties)} omit=${omit}`);
      for (const section of Object.keys(counts)) assert.ok(groups.some((g) => g.section === section));
    }
  }
});

test("each gap lands in the section of its own field", () => {
  const row = rowFromObject(obj("application"))!;
  const { type, groups } = groupsFor(obj("application"), ["name"]);
  const counts = missingBySection(row.missing, groups, REGISTRY[type]);
  // owner → Ownership; vendor, cost, renewal → Cost & contract; lifecycle, criticality → Lifecycle & risk.
  assert.deepEqual(counts, { ownership: 1, cost: 3, lifecycle: 2 });
  assert.equal(row.missingCount, 6);
});

test("collapsed sections are remembered per section and start expanded", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readCollapsed(storage).size, 0);
  let next = toggleCollapsed(readCollapsed(storage), "cost", true);
  next = toggleCollapsed(next, "lifecycle", true);
  writeCollapsed(storage, next);
  assert.deepEqual([...readCollapsed(storage)].sort(), ["cost", "lifecycle"]);
  writeCollapsed(storage, toggleCollapsed(readCollapsed(storage), "cost", false));
  assert.deepEqual([...readCollapsed(storage)], ["lifecycle"]);
  store.set(COLLAPSED_SECTIONS_KEY, "not json");
  assert.equal(readCollapsed(storage).size, 0);
  assert.equal(readCollapsed(null).size, 0);
});

test("section headers are buttons with aria-expanded and hide their fields when folded", () => {
  const src = readFileSync(new URL("../../components/mvp/InfraEditors.tsx", import.meta.url), "utf8");
  assert.match(src, /<button\s+type="button"\s+aria-expanded=\{open\}\s+aria-controls=\{bodyId\}/);
  assert.match(src, /\{open && \(\s*<div id=\{bodyId\}/);
  assert.match(src, /missingBySection\(missingRow\.missing, groups, REGISTRY\[type\]\)/);
  assert.match(src, /\{missing\} missing/);
  assert.doesNotMatch(src, /SECTION_LABEL\[group\.section\]\.toUpperCase\(\)/);
  const cost = readFileSync(new URL("../../components/mvp/CostSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(cost, />COST</);
  assert.match(cost, /text-\[13px\] text-\[#6b7289\]">Annual cost</);
});
