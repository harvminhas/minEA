import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
(globalThis as { React?: typeof React }).React = React;
import { renderToStaticMarkup } from "react-dom/server";
import { collectPendingTenants, pendingTenantId } from "./pending-tenants";
import { tenantLinks } from "@/lib/setup/add-plan";
import { CloudPicker } from "@/components/hosting/CloudPicker";
import { cardPendingTenants } from "@/components/add/AddCards";

const azure = (tenantName: string, extra: Record<string, unknown> = {}) => ({ provider: "azure" as const, tenantName, regionKey: null, ...extra });

test("a new tenant typed on one card is offered once per provider + name", () => {
  const got = collectPendingTenants([azure("Azure Tenant"), azure("  azure   tenant "), { provider: "aws", tenantName: "Azure Tenant", regionKey: null }, azure("X", { tenantId: "t1" }), azure("Shared", { tenantShared: true }), azure(""), null]);
  assert.deepEqual(got.map((p) => [p.provider, p.name]), [["azure", "Azure Tenant"], ["aws", "Azure Tenant"]]);
  assert.equal(got[0]!.id, pendingTenantId("azure", "azure tenant"));
  // Same name as an existing tenant of that provider: the existing one is already in the list.
  assert.deepEqual(collectPendingTenants([azure("Contoso")], [{ id: "c", name: "contoso", provider: "azure", regionKeys: [] }]), []);
});

test("other cards' dropdown offers 'Azure Tenant (new)'; picking it shows it selected without retyping", () => {
  const pending = collectPendingTenants([azure("Azure Tenant")]);
  const other = renderToStaticMarkup(createElement(CloudPicker, { mode: "own_cloud", value: azure(""), tenants: [], pending, onChange: () => {} }));
  assert.match(other, /Azure Tenant \(new\)/);
  const picked = renderToStaticMarkup(createElement(CloudPicker, { mode: "own_cloud", value: azure("Azure Tenant", { tenantShared: true }), tenants: [], pending, onChange: () => {} }));
  assert.match(picked, /tenant-shared/);
  assert.doesNotMatch(picked, /data-testid="tenant-new"/);
  // The card that typed it keeps its text box and doesn't list itself.
  const typer = renderToStaticMarkup(createElement(CloudPicker, { mode: "own_cloud", value: azure("Azure Tenant"), tenants: [], pending, onChange: () => {} }));
  assert.match(typer, /data-testid="tenant-new"/);
  assert.doesNotMatch(typer, /\(new\)/);
});

test("batch save makes one tenant for every card naming it, and reuses an existing one of that name", () => {
  const rows = [
    { key: "a", kind: "app", choice: "own_cloud", cloudProvider: "azure", tenantName: "Azure Tenant", regionKey: "azure:canadaeast" },
    { key: "b", kind: "app", choice: "own_cloud", cloudProvider: "azure", tenantName: "Azure Tenant", tenantShared: true },
    { key: "c", kind: "app", choice: "own_cloud", cloudProvider: "azure", tenantName: " azure tenant ", tenantShared: true },
    { key: "d", kind: "app", choice: "own_cloud", cloudProvider: "azure", tenantName: "Prod", tenantShared: true },
  ];
  const creates: Array<{ key: string; name: string }> = [];
  const rels = tenantLinks(rows as never[], [{ id: "prod1", type: "cloud_service", name: "PROD" }] as never[], creates as never[]);
  assert.deepEqual(creates.map((c) => c.name), ["Azure Tenant"]);
  const key = creates[0]!.key;
  assert.deepEqual(rels.map((r) => [r.fromKey, r.toKey ?? r.toId]), [["a", key], ["b", key], ["c", key], ["d", "prod1"]]);
  assert.deepEqual(rels[0]!.attributes, { region_key: "azure:canadaeast" });
});

test("cards: pending list comes from every card's typed tenant", () => {
  const rows = [
    { key: "a", choice: "own_cloud", cloudProvider: "azure", tenantName: "Azure Tenant" },
    { key: "b", choice: "own_cloud", cloudProvider: "azure", tenantName: "" },
    { key: "c", choice: "unknown", cloudProvider: "azure", tenantName: "Ignored" },
  ];
  assert.deepEqual(cardPendingTenants(rows as never[], []).map((p) => p.name), ["Azure Tenant"]);
});
