import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { impactOf } from "@/lib/impact/relationship-impact";
import { impactCandidates, type ChainItem } from "@/lib/views/opening";
import {
  CLOUD_PROVIDERS,
  PROVIDERS,
  PROVIDER_CASES,
  SAAS_PROVIDERS,
  defaultTenantName,
  linkRegionKey,
  matchRegion,
  planTenantSave,
  providerForVendor,
  regionAttributes,
  regionChoices,
  regionLabel,
  standardRegions,
  suggestsOwnCloud,
  tenantOptions,
  tenantProperties,
  tenantProvider,
} from "./cloud";
import { derivedHosting, fixedProviderId, regionId, tenantRegionId } from "@/lib/views/providers";
import { NO_REGION, NO_TENANT, hostingGroups } from "@/lib/views/hosting-groups";
import { whereBatch } from "@/lib/setup/where-batch";
import { tenantLinks } from "@/lib/setup/add-plan";
import { choicePatch } from "@/components/add/AddCards";
import { groupTenants, mergeProblem, regionDeleteWarning, tenantDeleteWarning } from "@/components/org/CloudsTenantsPage";

test("one provider/region catalogue, shared with the API", () => {
  const api = JSON.parse(readFileSync(new URL("../../../api/app/data/cloud_regions.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(readFileSync(new URL("./cloud-regions.json", import.meta.url), "utf8")), api);
  assert.deepEqual(PROVIDERS.map((p) => p.label), ["Azure", "AWS", "Google Cloud", "Microsoft 365", "Google Workspace", "Salesforce", "Other"]);
  assert.deepEqual(CLOUD_PROVIDERS.map((p) => p.id), ["azure", "aws", "gcp", "other"]);
  assert.deepEqual(SAAS_PROVIDERS.map((p) => p.id), ["m365", "google_workspace", "salesforce", "other"]);
});

test("built-in regions per provider use real names", () => {
  const names = (p: Parameters<typeof standardRegions>[0]) => standardRegions(p).map((r) => r.name);
  assert.ok(names("azure").includes("Canada Central") && names("azure").includes("Canada East"));
  assert.ok(names("aws").includes("ca-central-1") && names("aws").includes("ca-west-1"));
  assert.ok(names("gcp").includes("northamerica-northeast1") && names("gcp").includes("northamerica-northeast2"));
  assert.ok(names("m365").includes("Canada") && names("m365").includes("European Union"));
  assert.deepEqual(names("other"), []);
});

test("tenant provider: same rules as the API and migration 051", () => {
  for (const [props, name, expected] of PROVIDER_CASES) assert.equal(tenantProvider(props, name), expected, name);
  assert.equal(providerForVendor("Microsoft"), "m365");
  assert.equal(providerForVendor("Intuit"), null);
  assert.deepEqual(tenantProperties("azure", "own_cloud"), { platform_kind: "cloud_account", vendor: "microsoft", cloud_provider: "azure" });
  assert.deepEqual(tenantProperties("m365", "saas"), { platform_kind: "saas_suite", hosting_model: "saas", vendor: "microsoft", cloud_provider: "m365" });
  assert.equal(defaultTenantName("aws"), "AWS account");
  assert.equal(defaultTenantName("salesforce"), "Salesforce org");
  assert.ok(suggestsOwnCloud({ customBuilt: true }) && suggestsOwnCloud({ tool: { hosting: "either" } }) && !suggestsOwnCloud({ tool: { hosting: "saas" } }));
});

const custom = [{ id: "c1", key: "custom:c1", provider: "aws", name: "Lab DC" }];

test("links reference regions by key; old free text still reads (backward compatible)", () => {
  assert.equal(linkRegionKey({ region_key: "azure:canadacentral" }, "azure"), "azure:canadacentral");
  assert.equal(linkRegionKey({ region: " canada  CENTRAL " }, "azure"), "azure:canadacentral");
  assert.equal(linkRegionKey({ region: "Canada (Central)" }, "aws"), "aws:ca-central-1");
  assert.equal(linkRegionKey({ region: "lab dc" }, "aws", custom), "custom:c1");
  assert.equal(linkRegionKey({ region: "Canada Central" }, "m365"), "legacy:Canada Central", "M365 has no 'Canada Central': shown literally");
  assert.equal(linkRegionKey({}, "azure"), "");
  assert.equal(regionLabel("legacy:Canada Central"), "Canada Central");
  assert.equal(regionLabel("custom:c1", custom), "Lab DC");
  assert.equal(matchRegion("m365", "EU"), "m365:european-union");
  assert.deepEqual(regionAttributes("azure:canadacentral"), { region_key: "azure:canadacentral" });
  assert.deepEqual(regionAttributes("legacy:x"), {}, "never written back");
});

const objects = [
  { id: "prod", name: "Contoso Azure prod", type: "cloud_service", properties: { platform_kind: "cloud_account", cloud_provider: "azure", regions_used: ["azure:canadaeast"] } },
  { id: "dev", name: "Contoso Azure dev", type: "cloud_service", properties: { platform_kind: "cloud_account", vendor: "microsoft" } },
  { id: "m365t", name: "Contoso Microsoft 365", type: "cloud_service", properties: { platform_kind: "saas_suite", vendor: "microsoft" } },
  { id: "awsp", name: "AWS prod", type: "cloud_service", properties: { cloud_provider: "aws" } },
];
const apps = [
  { id: "portal", name: "Client portal", properties: { hosting_model: "own_cloud" } },
  { id: "api", name: "Intranet API", properties: { hosting_model: "own_cloud" } },
  { id: "devportal", name: "Portal (dev)", properties: { hosting_model: "own_cloud" } },
  { id: "bi", name: "Reporting", properties: { hosting_model: "own_cloud" } },
  { id: "m365", name: "Microsoft 365", properties: { hosting_model: "saas" } },
  { id: "teams", name: "Microsoft Teams", properties: { hosting_model: "saas" } },
  { id: "sf", name: "Salesforce", properties: { hosting_model: "saas" } },
];
const links = [
  { type: "runs_on", from_object_id: "portal", to_object_id: "prod", attributes: { region_key: "azure:canadacentral" } },
  { type: "runs_on", from_object_id: "api", to_object_id: "prod", attributes: { region_key: "azure:canadaeast" } },
  { type: "runs_on", from_object_id: "devportal", to_object_id: "dev", attributes: { region: "Canada Central" } }, // pre-051 text
  { type: "runs_on", from_object_id: "bi", to_object_id: "awsp", attributes: { region_key: "custom:c1" } },
  { type: "runs_on", from_object_id: "m365", to_object_id: "m365t", attributes: { region_key: "m365:canada" } },
  { type: "runs_on", from_object_id: "teams", to_object_id: "m365t", attributes: {} },
];
const edges = links.map((link) => ({ type: link.type, fromId: link.from_object_id, toId: link.to_object_id }));

test("picker: tenants by provider; this tenant's regions (used + linked) first", () => {
  const tenants = tenantOptions(objects, links, custom);
  assert.deepEqual(tenantOptions(objects, links, custom, "azure").map((t) => t.name), ["Contoso Azure dev", "Contoso Azure prod"]);
  const prod = tenants.find((t) => t.id === "prod")!;
  assert.deepEqual(prod.regionKeys.sort(), ["azure:canadacentral", "azure:canadaeast"]);
  const dev = tenants.find((t) => t.id === "dev")!;
  assert.deepEqual(dev.regionKeys, ["azure:canadacentral"], "old text resolves to the shared Azure region");
  const choices = regionChoices("azure", prod, custom);
  assert.deepEqual(choices.used.map((r) => r.name), ["Canada Central", "Canada East"]);
  assert.ok(!choices.standard.some((r) => r.key === "azure:canadacentral"));
  assert.deepEqual(regionChoices("aws", undefined, custom).custom.map((r) => r.name), ["Lab DC"]);
});

test("planTenantSave: reuse by id/name, patch only a changed region key, drop other tenant links", () => {
  const tenants = [{ id: "prod", name: "Contoso Azure prod" }, { id: "awsp", name: "AWS prod" }];
  const current = [{ id: "l1", tenantId: "prod", regionKey: "azure:canadaeast" }, { id: "l2", tenantId: "awsp", regionKey: "" }];
  assert.deepEqual(planTenantSave({ provider: "azure", tenantId: "prod", tenantName: "Contoso Azure prod", regionKey: "azure:canadacentral" }, current, tenants, "own_cloud"),
    { tenantId: null, createTenant: null, updateLinkId: "l1", regionKey: "azure:canadacentral", removeLinkIds: ["l2"] });
  assert.equal(planTenantSave({ provider: "gcp", tenantName: "Data project", regionKey: null }, [], tenants, "own_cloud").createTenant, "Data project");
  assert.deepEqual(planTenantSave({ provider: null, tenantName: "", regionKey: null }, current, tenants, "saas").removeLinkIds, []);
});

test("Hosting & location: Provider › Tenant › Region; untenanted SaaS keeps its derived provider", () => {
  const groups = hostingGroups(apps, objects, links, edges, custom);
  const azure = groups.find((g) => g.provider === "Azure")!;
  assert.deepEqual(azure.tenants.map((t) => t.name), ["Contoso Azure prod", "Contoso Azure dev"]);
  assert.deepEqual(azure.tenants[0]!.regions.map((r) => [r.region, r.apps.map((a) => a.id)]), [["Canada Central", ["portal"]], ["Canada East", ["api"]]]);
  assert.deepEqual(azure.tenants[1]!.regions.map((r) => r.region), ["Canada Central"]);
  const m365 = groups.find((g) => g.provider === "Microsoft 365")!;
  assert.deepEqual(m365.tenants[0]!.regions.map((r) => r.region), ["Canada", NO_REGION]);
  assert.deepEqual(groups.find((g) => g.provider === "AWS")!.tenants[0]!.regions[0]!.region, "Lab DC");
  const sf = groups.find((g) => g.provider === "Salesforce")!;
  assert.equal(sf.tenants[0]!.name, NO_TENANT);
});

test("Impact: Provider, Provider · Region (across tenants), Tenant, Tenant · Region", () => {
  const derived = derivedHosting(apps, edges, { tenants: objects, links, custom });
  const nodes = [...apps.map((a) => ({ id: a.id, name: a.name })), ...objects.map((o) => ({ id: o.id, name: o.name })), ...derived.nodes];
  const all = [...edges, ...derived.edges];
  const name = (id: string) => derived.items.find((item) => item.id === id)?.name;
  const stops = (id: string) => impactOf(nodes, all, id).map((hit) => hit.id).filter((hit) => apps.some((a) => a.id === hit)).sort();
  // Azure · Canada Central spans prod and dev (dev's link is still old free text).
  assert.equal(name(regionId("azure", "azure:canadacentral")), "Azure · Canada Central");
  assert.deepEqual(stops(regionId("azure", "azure:canadacentral")), ["devportal", "portal"]);
  // Tenant · Region is one tenant only.
  assert.equal(name(tenantRegionId("prod", "azure:canadacentral")), "Contoso Azure prod · Canada Central");
  assert.deepEqual(stops(tenantRegionId("prod", "azure:canadacentral")), ["portal"]);
  // Tenant and provider.
  assert.deepEqual(stops("prod"), ["api", "portal"]);
  assert.deepEqual(stops(fixedProviderId("azure")), ["api", "devportal", "portal"]);
  assert.deepEqual(stops(fixedProviderId("m365")), ["m365", "teams"]);
  // M365 "Canada" is its own region, not Azure's.
  assert.deepEqual(stops(regionId("m365", "m365:canada")), ["m365"]);
  assert.equal(name(regionId("aws", "custom:c1")), "AWS · Lab DC");
  const items: ChainItem[] = derived.items;
  const candidates = impactCandidates(items, nodes, all).map((c) => c.name);
  assert.ok(candidates.includes("Azure · Canada Central") && candidates.includes("Azure"));
});

test("wizard step 3 batch: one tenant, runs_on carries the region KEY", () => {
  const batch = whereBatch([], [], [
    { key: "a", objectId: "o1", choice: "own_cloud", detail: { provider: "azure", tenantName: "Contoso Azure", regionKey: "azure:canadacentral" } },
    { key: "b", objectId: "o2", choice: "own_cloud", detail: { provider: "azure", tenantName: "contoso azure", regionKey: null } },
    { key: "c", objectId: "o3", choice: "saas" },
  ], {}, {}, { tenants: [], tenantLinked: new Set() });
  const created = batch.creates.filter((item) => item.type === "cloud_service");
  assert.equal(created.length, 1);
  assert.equal(created[0]!.properties.cloud_provider, "azure");
  const runs = batch.relationships.filter((rel) => rel.to_type === "cloud_service");
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0]!.attributes, { region_key: "azure:canadacentral" });
  assert.equal(runs[1]!.attributes, undefined);
});

test("shared add card: reuse a tenant by id, region key on the link; Our cloud starts on Azure", () => {
  const estate = [{ id: "prod", type: "cloud_service", name: "Contoso Azure prod" }] as never[];
  const creates: never[] = [];
  const rels = tenantLinks([{ key: "r1", kind: "app", choice: "own_cloud", cloudProvider: "azure", tenantId: "prod", tenantName: "Contoso Azure prod", regionKey: "azure:canadacentral" }] as never[], estate, creates);
  assert.equal(creates.length, 0);
  assert.deepEqual(rels[0], { type: "runs_on", fromKey: "r1", fromType: "application", toId: "prod", toType: "cloud_service", attributes: { region_key: "azure:canadacentral" } });
  const row = { choice: "unknown", cloudProvider: null } as never;
  assert.deepEqual(choicePatch(row, "own_cloud", [{ id: "prod", name: "Contoso Azure prod" }], "m365"), { choice: "own_cloud", cloudProvider: "azure", tenantId: "prod", tenantName: "Contoso Azure prod", regionKey: null });
  assert.equal(choicePatch(row, "own_cloud", [], "m365").tenantName, "Azure tenant");
  assert.deepEqual(choicePatch({ choice: "own_cloud", cloudProvider: "azure" } as never, "saas", [], "m365"), { choice: "saas", cloudProvider: "m365", tenantId: undefined, tenantName: "", regionKey: null });
});

test("Clouds & tenants page: grouped by provider, merge within one provider, delete warns with usage", () => {
  const rows = [
    { id: "1", name: "Contoso Azure prod", owner: "", provider: "azure", platform_kind: "cloud_account", tenant_id: "", annual_cost: "", regions_used: [], usage: 3 },
    { id: "2", name: "contoso azure prod", owner: "", provider: "azure", platform_kind: "cloud_account", tenant_id: "", annual_cost: "", regions_used: [], usage: 0 },
    { id: "3", name: "M365", owner: "", provider: "m365", platform_kind: "saas_suite", tenant_id: "", annual_cost: "", regions_used: [], usage: 1 },
  ];
  assert.deepEqual(groupTenants(rows).map((g) => [g.label, g.tenants.length]), [["Azure", 2], ["Microsoft 365", 1]]);
  assert.equal(mergeProblem(rows, ["1", "2"]), "");
  assert.match(mergeProblem(rows, ["1", "3"]), /one provider/);
  assert.match(tenantDeleteWarning(rows[0]!), /3 apps run on it/);
  assert.match(regionDeleteWarning({ id: "c", key: "custom:c", provider: "aws", name: "Lab", usage: 0 }), /Nothing uses/);
  const src = readFileSync(new URL("../../components/org/CloudsTenantsPage.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(!isOrgAdmin\)/);
  assert.match(src, /cloudsApi\.mergeTenants/);
  assert.match(src, /cloudsApi\.mergeRegions/);
  assert.match(src, /aria-label="Workspace"/, "scoped per workspace like People & teams");
  const settings = readFileSync(new URL("../../app/orgs/[orgSlug]/settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /settings\/people[\s\S]{0,400}settings\/clouds/, "linked next to People & teams");
});
