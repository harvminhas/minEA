import type { ImpactEdge, ImpactNode } from "@/lib/impact/relationship-impact";
import { exactCatalogTool, normalizeTerm } from "@/lib/setup/match-tools";
import {
  isTenantLink,
  linkRegionKey,
  providerForVendor,
  providerLabel,
  regionLabel,
  tenantProvider,
  type CloudProvider,
  type CustomRegion,
} from "@/lib/hosting/cloud";
import type { ChainItem } from "@/lib/views/opening";

/**
 * Cloud-only and desktop-only estates have no servers, yet a SaaS app still runs on something: its
 * provider. These are DERIVED hosts, never saved: each SaaS app with no runs_on / built_on link
 * "runs on" its provider (Microsoft 365 for Teams, Intuit for QuickBooks…), each desktop app on
 * "People's computers". With tenants and regions recorded, Impact also offers "Provider · Region"
 * (across every tenant of that provider) and "Tenant · Region".
 */
export const DERIVED_PREFIX = "provider:";
export const DESKTOP_HOST_ID = `${DERIVED_PREFIX}people-computers`;
export const UNKNOWN_PROVIDER = "Cloud provider not known";
const CLOUD = new Set(["saas", "cloud", "paas"]);

export type ProviderApp = { id: string; name: string; vendor?: string; properties?: Record<string, unknown> | null };
export type ProviderGroup = { id: string; name: string; desktop: boolean; provider: CloudProvider | null; apps: { id: string; name: string }[] };

/** A fixed provider ("provider:azure") or, for vendors not on the list, the vendor name ("provider:intuit"). */
export const providerId = (providerOrName: string) =>
  `${DERIVED_PREFIX}${normalizeTerm(providerOrName).replace(/\s+/g, "-") || "unknown"}`;
export const fixedProviderId = (provider: CloudProvider) => `${DERIVED_PREFIX}${provider}`;
export const regionId = (provider: CloudProvider, regionKey: string) => `${DERIVED_PREFIX}region:${provider}:${regionKey}`;
export const tenantRegionId = (tenantId: string, regionKey: string) => `${DERIVED_PREFIX}tenant-region:${tenantId}:${regionKey}`;

export const isDerivedHost = (id: string | undefined | null) => Boolean(id?.startsWith(DERIVED_PREFIX));
export const isDerivedRegion = (kind: unknown) => kind === "region" || kind === "tenant_region";

/** The SaaS provider an app runs on: its saved vendor, else the catalogue's vendor for that name. */
export function appProvider(app: ProviderApp): { id: string; name: string; provider: CloudProvider | null } {
  const vendor = String(app.vendor || app.properties?.vendor || "").trim() || exactCatalogTool(app.name)?.vendor?.trim() || "";
  const fixed = providerForVendor(vendor);
  if (fixed) return { id: fixedProviderId(fixed), name: providerLabel(fixed), provider: fixed };
  const name = vendor || UNKNOWN_PROVIDER;
  return { id: providerId(name), name, provider: null };
}

/** @deprecated name only; see appProvider. */
export const providerName = (app: ProviderApp) => appProvider(app).name;

/** Apps with no real host link, grouped by provider (cloud) or People's computers (desktop). */
export function providerGroups(apps: ProviderApp[], edges: ImpactEdge[]): ProviderGroup[] {
  const linked = new Set(edges.filter((edge) => edge.type === "runs_on" || edge.type === "built_on").map((edge) => edge.fromId));
  const groups = new Map<string, ProviderGroup>();
  for (const app of apps) {
    if (linked.has(app.id)) continue;
    const hosting = String(app.properties?.hosting_model ?? "");
    let group: ProviderGroup;
    if (hosting === "desktop") {
      group = groups.get(DESKTOP_HOST_ID) ?? { id: DESKTOP_HOST_ID, name: "People's computers", desktop: true, provider: null, apps: [] };
    } else if (CLOUD.has(hosting)) {
      const found = appProvider(app);
      group = groups.get(found.id) ?? { id: found.id, name: found.name, desktop: false, provider: found.provider, apps: [] };
    } else continue;
    group.apps.push({ id: app.id, name: app.name });
    groups.set(group.id, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.desktop) - Number(b.desktop) || b.apps.length - a.apps.length || a.name.localeCompare(b.name));
}

export type HostingLink = { type: string; from_object_id: string; to_object_id: string; attributes?: Record<string, unknown> | null };
export type TenantObject = { id: string; name: string; type: string; properties?: Record<string, unknown> | null };

/** One app → tenant link, resolved: the tenant's provider and the region key (or ""). */
export type TenantLinkInfo = { appId: string; tenant: TenantObject; provider: CloudProvider; regionKey: string };

export function tenantLinkInfo(apps: ProviderApp[], tenants: TenantObject[], links: HostingLink[], custom: CustomRegion[] = []): TenantLinkInfo[] {
  const byId = new Map(tenants.filter((object) => object.type === "cloud_service").map((object) => [object.id, object]));
  const appIds = new Set(apps.map((app) => app.id));
  const out: TenantLinkInfo[] = [];
  for (const link of links) {
    const tenant = byId.get(link.to_object_id);
    if (!isTenantLink(link) || !tenant || !appIds.has(link.from_object_id)) continue;
    const provider = tenantProvider(tenant.properties, tenant.name);
    out.push({ appId: link.from_object_id, tenant, provider, regionKey: linkRegionKey(link.attributes, provider, custom) });
  }
  return out;
}

/**
 * The derived hosts as Impact items, nodes and runs_on edges:
 *  - SaaS app with no host link → its provider; desktop app → People's computers
 *  - each tenant/account → its provider ("If Azure goes down" reaches every Azure tenant)
 *  - app on a tenant with a region → "Provider · Region" (one node across all that provider's
 *    tenants: "Azure · Canada Central" spans prod and dev) and "Tenant · Region"
 * Region names are taken literally (M365 "Canada" is not Azure "Canada Central").
 */
export function derivedHosting(
  apps: ProviderApp[],
  edges: ImpactEdge[],
  extra: { tenants?: TenantObject[]; links?: HostingLink[]; custom?: CustomRegion[] } = {},
): { items: ChainItem[]; nodes: ImpactNode[]; edges: ImpactEdge[] } {
  const groups = providerGroups(apps, edges);
  const items: ChainItem[] = [];
  const nodes: ImpactNode[] = [];
  const out: ImpactEdge[] = [];
  const add = (id: string, name: string, kind: "provider" | "desktop" | "region" | "tenant_region", typeLabel: string) => {
    if (items.some((item) => item.id === id)) return;
    items.push({ id, name, kind: "platform", ownerTeam: "", criticality: "", description: typeLabel, properties: { derived: true, derived_kind: kind } });
    nodes.push({ id, name, typeLabel });
  };
  for (const group of groups) {
    add(group.id, group.name, group.desktop ? "desktop" : "provider", group.desktop ? "Installed desktop software" : "Cloud provider");
    for (const app of group.apps) out.push({ type: "runs_on", fromId: app.id, toId: group.id });
  }
  const custom = extra.custom ?? [];
  for (const tenant of (extra.tenants ?? []).filter((object) => object.type === "cloud_service")) {
    const provider = tenantProvider(tenant.properties, tenant.name);
    if (provider === "other" && tenant.properties?.cloud_provider !== "other") continue;
    add(fixedProviderId(provider), providerLabel(provider), "provider", "Cloud provider");
    out.push({ type: "runs_on", fromId: tenant.id, toId: fixedProviderId(provider) });
  }
  for (const info of tenantLinkInfo(apps, extra.tenants ?? [], extra.links ?? [], custom)) {
    if (!info.regionKey) continue;
    const label = regionLabel(info.regionKey, custom);
    const region = regionId(info.provider, info.regionKey);
    add(region, `${providerLabel(info.provider)} · ${label}`, "region", "Region");
    out.push({ type: "runs_on", fromId: info.appId, toId: region });
    const tenantRegion = tenantRegionId(info.tenant.id, info.regionKey);
    add(tenantRegion, `${info.tenant.name} · ${label}`, "tenant_region", "Tenant region");
    out.push({ type: "runs_on", fromId: info.appId, toId: tenantRegion });
  }
  return { items, nodes, edges: out };
}
