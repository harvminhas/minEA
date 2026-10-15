import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareRows, planInputs, buildBatch } from "@/lib/setup/add-plan";
import { choicePatch, cardPendingTenants } from "@/components/add/AddCards";
import { CloudPicker } from "@/components/hosting/CloudPicker";
import { resolveSharedTenants } from "./pending-tenants";
(globalThis as { React?: typeof React }).React = React;

/** What the cards do, step by step, with the same helpers the components call. */
function cards() {
  let rows: any[] = prepareRows("ACF List\nPower App\nPower BI", "app", []);
  const patch = (i: number, p: any) => { const key = rows[i].key; rows = resolveSharedTenants(rows.map((r) => (r.key === key ? { ...r, ...p } : r))); };
  return { get rows() { return rows; }, patch, pending: () => cardPendingTenants(rows, []) };
}

function payload(rows: any[]) {
  const batch = buildBatch(planInputs(rows), []);
  return {
    creates: batch.creates.map((item: any) => ({ key: item.key, type: item.type, name: item.name, properties: item.properties, owner: item.owner, owner_team_name: item.ownerTeam, point_of_contact_name: item.ownerName })),
    updates: batch.updates.map((item: any) => ({ id: item.id, properties: item.properties, owner: item.owner, owner_team_name: item.ownerTeam, point_of_contact_name: item.ownerName })),
    relationships: batch.relationships.map((item: any) => ({ type: item.type, from_key: item.fromKey, to_key: item.toKey, from_id: item.fromId, to_id: item.toId, from_type: item.fromType, to_type: item.toType, ...(item.attributes ? { attributes: item.attributes } : {}) })),
  };
}

test("the reported flow builds the payload the API integration test saves (fixture in sync)", () => {
  const c = cards();
  c.patch(0, choicePatch(c.rows[0], "own_cloud", [], "other", c.pending()));
  c.patch(0, { tenantName: "Azure Tenant", tenantShared: false, regionKey: "azure:canadaeast" });
  c.patch(1, choicePatch(c.rows[1], "own_cloud", [], "other", c.pending()));
  assert.equal(c.rows[1].tenantShared, true, "card 2 joins the new tenant typed on card 1");
  const fixture = JSON.parse(readFileSync(new URL("../../../api/tests/fixtures/add_batch_shared_tenant.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(payload(c.rows))), fixture);
});

test("typing 'Azure Tenant' (same as the default name) still shows as shared on other cards", () => {
  const c = cards();
  // Card 2 was already on Our cloud with the default "Azure tenant" before card 1 typed.
  c.patch(1, choicePatch(c.rows[1], "own_cloud", [], "other", c.pending()));
  c.patch(0, choicePatch(c.rows[0], "own_cloud", [], "other", c.pending()));
  // Card 1 joined it; the user picks "+ New tenant…" and types the name anyway (what the input does).
  c.patch(0, { tenantName: "Azure Tenant", tenantShared: false, tenantSharedWith: undefined });
  const pending = c.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.count, 2);
  const html = renderToStaticMarkup(createElement(CloudPicker, { mode: "own_cloud", value: { provider: "azure", tenantName: c.rows[1].tenantName, tenantId: c.rows[1].tenantId, regionKey: null, tenantShared: c.rows[1].tenantShared }, tenants: [], pending, onChange: () => {} }));
  assert.match(html, /tenant-shared|same as another card/);
  assert.match(html, /created when you click Add/);
  assert.equal(payload(c.rows).creates.filter((x) => x.type === "cloud_service").length, 1);
});

test("a picking card follows a rename on the card that typed it; offered on every keystroke, no blur needed", () => {
  const c = cards();
  c.patch(0, choicePatch(c.rows[0], "own_cloud", [], "other", c.pending()));
  c.patch(0, { tenantName: "Az" });
  const html = renderToStaticMarkup(createElement(CloudPicker, { mode: "own_cloud", value: { provider: "azure", tenantName: "", regionKey: null }, tenants: [{ id: "x", name: "Old", provider: "azure", regionKeys: [] }], pending: c.pending(), onChange: () => {} }));
  assert.match(html, /Az \(new\)/);
  c.patch(1, choicePatch(c.rows[1], "own_cloud", [], "other", c.pending()));
  assert.equal(c.rows[1].tenantSharedWith, c.rows[0].key);
  c.patch(0, { tenantName: "Azure Prod" });
  assert.equal(c.rows[1].tenantName, "Azure Prod");
  const p = payload(c.rows);
  assert.deepEqual(p.creates.filter((x) => x.type === "cloud_service").map((x) => x.name), ["Azure Prod"]);
  assert.equal(p.relationships.filter((r) => r.to_key === "tenant:azure:azure prod").length, 2);
});

test("save errors are shown, not swallowed", () => {
  const src = readFileSync(new URL("../../components/add/AddCards.tsx", import.meta.url), "utf8");
  assert.match(src, /setError\(err instanceof Error \? err\.message : "Could not save"\)/);
  assert.match(src, /phase === "error" && error && <p/);
});
