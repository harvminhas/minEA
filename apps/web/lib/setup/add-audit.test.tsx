// Every answer the Add flow collects, as saved by the real batch endpoint (fixture written by
// apps/api/tests/test_add_audit.py with ADD_AUDIT_WRITE=1), must show on the app's detail panel and
// round-trip through its inline edit (the detail page is also the edit page).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { REGISTRY } from "@/lib/fields/registry";
import { applyPatch, readField, toPatch } from "@/lib/fields/save";
import { asRecord, displayValue, toFieldEdges } from "@/components/mvp/InfraEditors";
import { linkRegionKey, regionLabel, tenantOptions } from "@/lib/hosting/cloud";
import { LocationChips } from "@/components/hosting/LocationChips";
import { readFeatures } from "@/lib/ai/features";
import type { MinEAObject } from "@minea/types";

const saved = JSON.parse(readFileSync(new URL("./__fixtures__/add-audit-saved.json", import.meta.url), "utf8")) as { objects: MinEAObject[]; relationships: { id: string; type: string; from_object_id: string; from_type: string; to_object_id: string; to_type: string; attributes?: Record<string, unknown> }[] };
const edges = toFieldEdges(saved.relationships);
const names = new Map(saved.objects.map((o) => [o.id, o.name]));
const app = (name: string) => saved.objects.find((o) => o.name === name && o.type === "application")!;
const def = (key: string) => REGISTRY.application.find((f) => f.key === key)!;
const shown = (name: string, key: string) => { const o = app(name); return displayValue(def(key), asRecord(o, edges), o, edges, names); };

test("detail shows every Ask-card answer", () => {
  assert.equal(shown("Slack", "name"), "Slack");
  assert.equal(shown("Slack", "vendor"), "Salesforce");
  assert.equal(shown("Slack", "category"), "Productivity");
  assert.equal(shown("Payroll Tool", "is_custom_built"), "Yes");
  assert.equal(shown("Slack", "hosting_model"), "SaaS");
  assert.equal(shown("Payroll Tool", "hosting_model"), "Our cloud");
  assert.equal(shown("Time Clock", "hosting_model"), "On-premises");
  assert.equal(shown("Time Clock", "runs_on"), "SRV-01");
});

test("detail shows the tenant and region (Our cloud) in Where does it run?", () => {
  const payroll = app("Payroll Tool");
  const tenants = tenantOptions(saved.objects as never, saved.relationships as never);
  const link = saved.relationships.find((r) => r.from_object_id === payroll.id && r.type === "runs_on")!;
  const tenant = tenants.find((t) => t.id === link.to_object_id)!;
  assert.equal(tenant.name, "Contoso Azure");
  assert.equal(tenant.provider, "azure");
  const regionKey = linkRegionKey(link.attributes, tenant.provider);
  assert.equal(regionKey, "azure:canadaeast");
  const html = renderToStaticMarkup(
    <LocationChips value="own_cloud" servers={[]} onChoose={() => {}} onPickServer={() => {}} detail={{ provider: "azure", tenantName: tenant.name, tenantId: tenant.id, regionKey }} tenants={tenants} onDetail={() => {}} />
  );
  assert.match(html, /Our cloud/);
  assert.match(html, /Contoso Azure/);
  assert.match(html, new RegExp(regionLabel(regionKey).replace(/[()]/g, ".")));
});

test("detail shows AI features, owners, renewals, licences and cost", () => {
  assert.deepEqual(readFeatures(app("Slack").properties).map((f) => [f.name, f.status]), [["Slack AI (summaries, recaps, search answers)", "on"]]);
  for (const [name, person, renewal, seats] of [["Slack", "Dana Lee", "2027-03-31", "120"], ["Payroll Tool", "Raj Patel", "2027-06-30", "40"], ["Time Clock", "Mo Khan", "2027-09-30", "15"]]) {
    assert.match(shown(name, "owner"), /IT Ops/);
    assert.match(shown(name, "owner"), new RegExp(person));
    assert.match(shown(name, "contract_renewal"), new RegExp(renewal.slice(0, 4)));
    assert.equal(shown(name, "licence_count"), seats);
  }
  assert.equal(shown("Slack", "cost"), "$12,600/yr"); // 120 licences × $8.75/mo × 12 (typical $900 line replaced)
});

test("edit round-trips every Add field", () => {
  const cases: [string, string, unknown][] = [
    ["Slack", "name", "Slack Enterprise"],
    ["Slack", "category", "Communication"],
    ["Payroll Tool", "is_custom_built", "no"],
    ["Slack", "hosting_model", "own_cloud"],
    ["Payroll Tool", "hosting_model", "saas"],
    ["Time Clock", "hosting_model", "desktop"],
    ["Slack", "licence_count", 150],
    ["Slack", "contract_renewal", "2028-01-31"],
    ["Slack", "owner", { ownerTeamId: "", ownerTeamName: "Finance", pointOfContactId: "", pointOfContactName: "Ana Ruiz" }],
  ];
  for (const [name, key, value] of cases) {
    const o = app(name);
    const record = asRecord(o, edges);
    const next = applyPatch(record, toPatch(def(key), value, record, edges), edges);
    const back = readField(def(key), next, edges);
    if (key === "owner") assert.deepEqual([(back as { ownerTeamName: string }).ownerTeamName, (back as { pointOfContactName: string }).pointOfContactName], ["Finance", "Ana Ruiz"]);
    else assert.deepEqual(back, value, `${name}.${key}`);
  }
  assert.ok(def("hosting_model").options!.some((opt) => opt.value === "own_cloud" && opt.label === "Our cloud"));
});
