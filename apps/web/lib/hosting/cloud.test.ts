import { test } from "node:test";
import assert from "node:assert/strict";
import { impactOf } from "@/lib/impact/relationship-impact";
import { defaultTenantName, linkRegion, planTenantSave, providerGroupLabel, regionSuggestions, suggestsOwnCloud, tenantOptions, tenantProperties } from "./cloud";
import { derivedHosting } from "@/lib/views/providers";
import { NO_REGION, NO_TENANT, hostingGroups } from "@/lib/views/hosting-groups";
import { whereBatch } from "@/lib/setup/where-batch";
import { tenantLinks } from "@/lib/setup/add-plan";

test("provider-specific region suggestions, free text otherwise", () => {
  assert.ok(regionSuggestions("azure").includes("Canada Central"));
  assert.ok(regionSuggestions("aws").includes("ca-central-1"));
  assert.ok(regionSuggestions("gcp").includes("northamerica-northeast1"));
  assert.ok(regionSuggestions("microsoft").length > 0);
  assert.deepEqual(regionSuggestions("acme"), []);
  assert.equal(linkRegion({ region: "  Canada  " }), "Canada");
  assert.equal(linkRegion(null), "");
});

test("tenant records are existing platform records; names and groups", () => {
  assert.deepEqual(tenantProperties("azure"), { platform_kind: "cloud_account", vendor: "microsoft", cloud_provider: "azure" });
  assert.equal(tenantProperties(null, "Microsoft").platform_kind, "saas_suite");
  assert.equal(defaultTenantName("aws"), "AWS account");
  assert.equal(providerGroupLabel("Amazon"), "Amazon Web Services");
  assert.equal(providerGroupLabel("Microsoft Corporation"), "Microsoft");
  assert.equal(suggestsOwnCloud({ customBuilt: true }), true);
  assert.equal(suggestsOwnCloud({ tool: { hosting: "either" } }), true);
  assert.equal(suggestsOwnCloud({ tool: { hosting: "saas" } }), false);
});

test("planTenantSave: reuse by name, patch only a changed region, drop other tenant links", () => {
  const tenants = [{ id: "t1", name: "Contoso Azure", group: "Microsoft" }, { id: "t2", name: "AWS prod", group: "Amazon Web Services" }];
  const links = [{ id: "l1", tenantId: "t1", region: "Canada East" }, { id: "l2", tenantId: "t2", region: "" }];
  const plan = planTenantSave({ provider: "azure", tenantName: "contoso azure", region: "Canada Central" }, links, tenants, "own_cloud");
  assert.deepEqual(plan, { tenantId: null, createTenant: null, updateLinkId: "l1", region: "Canada Central", removeLinkIds: ["l2"] });
  const fresh = planTenantSave({ provider: "gcp", tenantName: "New project", region: "" }, [], tenants, "own_cloud");
  assert.equal(fresh.createTenant, "New project");
  assert.deepEqual(planTenantSave({ provider: null, tenantName: "", region: "" }, links, tenants, "saas").removeLinkIds, []);
});

const apps = [
  { id: "m365", name: "Microsoft 365", vendor: "Microsoft", properties: { hosting_model: "saas" } },
  { id: "teams", name: "Teams", vendor: "Microsoft", properties: { hosting_model: "saas" } },
  { id: "portal", name: "Client portal", vendor: "", properties: { hosting_model: "own_cloud" } },
  { id: "sf", name: "Salesforce", vendor: "Salesforce", properties: { hosting_model: "saas" } },
];
const tenants = [
  { id: "az", name: "Contoso Azure", type: "cloud_service", properties: { platform_kind: "cloud_account", vendor: "microsoft", cloud_provider: "azure" } },
  { id: "mt", name: "Contoso M365", type: "cloud_service", properties: { platform_kind: "saas_suite", vendor: "microsoft" } },
];
const links = [
  { type: "runs_on", from_object_id: "portal", to_object_id: "az", attributes: { region: "Canada Central" } },
  { type: "runs_on", from_object_id: "m365", to_object_id: "mt", attributes: { region: "Canada" } },
  { type: "runs_on", from_object_id: "teams", to_object_id: "mt", attributes: {} },
];
const edges = links.map((link) => ({ type: link.type, fromId: link.from_object_id, toId: link.to_object_id }));

test("Hosting & location: Provider › Tenant › Region, derived provider kept for untenanted SaaS", () => {
  const groups = hostingGroups(apps, tenants, links, edges);
  const ms = groups.find((group) => group.provider === "Microsoft")!;
  assert.deepEqual(ms.tenants.map((tenant) => tenant.name), ["Contoso Azure", "Contoso M365"]);
  const m365 = ms.tenants[1];
  assert.deepEqual(m365.regions.map((region) => [region.region, region.apps.map((app) => app.id)]), [["Canada", ["m365"]], [NO_REGION, ["teams"]]]);
  const sf = groups.find((group) => group.provider === "Salesforce")!;
  assert.equal(sf.tenants[0].name, NO_TENANT);
  assert.deepEqual(sf.tenants[0].regions[0].apps.map((app) => app.id), ["sf"]);
});

test("Impact: provider, tenant and 'Provider · Region' candidates stop the right apps (geo strings literal)", () => {
  const derived = derivedHosting(apps, edges, { tenants, links });
  const names = derived.items.map((item) => item.name);
  assert.ok(names.includes("Microsoft · Canada Central"));
  assert.ok(names.includes("Microsoft · Canada"), "M365 geo kept literally, not merged with Canada Central");
  const nodes = [...apps.map((app) => ({ id: app.id, name: app.name, typeLabel: "App" })), ...tenants.map((t) => ({ id: t.id, name: t.name, typeLabel: "Platform" })), ...derived.nodes];
  const all = [...edges, ...derived.edges];
  const region = derived.items.find((item) => item.name === "Microsoft · Canada Central")!;
  assert.equal(region.properties.derived_kind, "region");
  assert.deepEqual(impactOf(nodes, all, region.id).map((hit) => hit.id), ["portal"]);
  assert.deepEqual(impactOf(nodes, all, "mt").map((hit) => hit.id).sort(), ["m365", "teams"]);
  const ms = impactOf(nodes, all, "provider:microsoft").map((hit) => hit.id);
  for (const id of ["portal", "m365", "teams", "az", "mt"]) assert.ok(ms.includes(id), id);
  assert.ok(!ms.includes("sf"));
});

test("wizard step 3 batch creates the tenant once and links with the region", () => {
  const batch = whereBatch([], [], [
    { key: "a", objectId: "o1", choice: "own_cloud", detail: { provider: "azure", tenantName: "Contoso Azure", region: "Canada Central" } },
    { key: "b", objectId: "o2", choice: "own_cloud", detail: { provider: "azure", tenantName: "contoso azure", region: "" } },
    { key: "c", objectId: "o3", choice: "saas" },
  ], {}, {}, { tenants: [], tenantLinked: new Set() });
  assert.equal(batch.creates.filter((item) => item.type === "cloud_service").length, 1);
  const runs = batch.relationships.filter((rel) => rel.to_type === "cloud_service");
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].attributes, { region: "Canada Central" });
  assert.equal(batch.updates.find((update) => update.id === "o1")?.properties.hosting_model, "own_cloud");
});

test("shared add card: Our cloud row reuses an existing tenant and carries the region", () => {
  const estate = [{ id: "az", type: "cloud_service", name: "Contoso Azure" }] as never[];
  const creates: never[] = [];
  const rels = tenantLinks([{ key: "r1", kind: "app", choice: "own_cloud", cloudProvider: "azure", tenantName: "Contoso Azure", region: "Canada East" }] as never[], estate, creates);
  assert.equal(creates.length, 0);
  assert.deepEqual(rels[0], { type: "runs_on", fromKey: "r1", fromType: "application", toId: "az", toType: "cloud_service", attributes: { region: "Canada East" } });
  assert.equal(tenantOptions([{ id: "az", name: "Contoso Azure", type: "cloud_service", properties: { cloud_provider: "azure" } }])[0].group, "Microsoft");
});
