import type { ImpactEdge, ImpactNode } from "@/lib/impact/relationship-impact";
import { exactCatalogTool, normalizeTerm } from "@/lib/setup/match-tools";
import { linkRegion, providerGroupLabel, tenantGroup } from "@/lib/hosting/cloud";
import type { ChainItem } from "@/lib/views/opening";

/**
 * Cloud-only and desktop-only estates have no servers, yet a SaaS app still runs on something: its
 * provider. These are DERIVED hosts, never saved: each Cloud (SaaS) app with no runs_on / built_on
 * link "runs on" its vendor (Microsoft for Teams and Microsoft 365, Intuit for QuickBooks…), and each
 * desktop app on "People's computers". Impact can then say "If Microsoft goes down → these apps break".
 */
export const DERIVED_PREFIX = "provider:";
export const DESKTOP_HOST_ID = `${DERIVED_PREFIX}people-computers`;
export const UNKNOWN_PROVIDER = "Cloud provider not known";
const CLOUD = new Set(["saas", "cloud", "paas"]);

export type ProviderApp = { id: string; name: string; vendor?: string; properties?: Record<string, unknown> | null };
export type ProviderGroup = { id: string; name: string; desktop: boolean; apps: { id: string; name: string }[] };

export const providerId = (name: string) => `${DERIVED_PREFIX}${normalizeTerm(name).replace(/\s+/g, "-") || "unknown"}`;
export const regionId = (provider: string, region: string) => `${DERIVED_PREFIX}region:${normalizeTerm(provider).replace(/\s+/g, "-")}:${normalizeTerm(region).replace(/\s+/g, "-")}`;

export const isDerivedHost = (id: string | undefined | null) => Boolean(id?.startsWith(DERIVED_PREFIX));

/** The SaaS provider an app runs on: its saved vendor, else the catalogue's vendor for that name. */
export function providerName(app: ProviderApp): string {
  const saved = String(app.vendor || app.properties?.vendor || "").trim();
  if (saved) return providerGroupLabel(saved);
  return providerGroupLabel(exactCatalogTool(app.name)?.vendor?.trim() ?? "") || UNKNOWN_PROVIDER;
}

/** Apps with no real host link, grouped by provider (cloud) or People's computers (desktop). */
export function providerGroups(apps: ProviderApp[], edges: ImpactEdge[]): ProviderGroup[] {
  const linked = new Set(edges.filter((edge) => edge.type === "runs_on" || edge.type === "built_on").map((edge) => edge.fromId));
  const groups = new Map<string, ProviderGroup>();
  for (const app of apps) {
    if (linked.has(app.id)) continue;
    const hosting = String(app.properties?.hosting_model ?? "");
    let group: ProviderGroup;
    if (hosting === "desktop") {
      group = groups.get(DESKTOP_HOST_ID) ?? { id: DESKTOP_HOST_ID, name: "People's computers", desktop: true, apps: [] };
    } else if (CLOUD.has(hosting)) {
      const name = providerName(app);
      const id = providerId(name);
      group = groups.get(id) ?? { id, name, desktop: false, apps: [] };
    } else continue;
    group.apps.push({ id: app.id, name: app.name });
    groups.set(group.id, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.desktop) - Number(b.desktop) || b.apps.length - a.apps.length || a.name.localeCompare(b.name));
}

export type HostingLink = { type: string; from_object_id: string; to_object_id: string; attributes?: Record<string, unknown> | null };
export type TenantObject = { id: string; name: string; type: string; properties?: Record<string, unknown> | null };

/**
 * The derived hosts as Impact items, nodes and runs_on edges:
 *  - each SaaS app with no host link → its provider (Microsoft, Intuit…); desktop → People's computers
 *  - each tenant/account platform → its provider (so "If Microsoft goes down" reaches Azure and M365 tenants)
 *  - each app → tenant link with a region → "Provider · Region" (region strings taken literally)
 */
export function derivedHosting(
  apps: ProviderApp[],
  edges: ImpactEdge[],
  extra: { tenants?: TenantObject[]; links?: HostingLink[] } = {},
): { items: ChainItem[]; nodes: ImpactNode[]; edges: ImpactEdge[] } {
  const groups = providerGroups(apps, edges);
  const items: ChainItem[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    kind: "platform" as const,
    ownerTeam: "",
    criticality: "",
    description: group.desktop ? "Installed desktop software" : "Cloud provider",
    properties: { derived: true, derived_kind: group.desktop ? "desktop" : "provider" },
  }));
  const nodes: ImpactNode[] = groups.map((group) => ({ id: group.id, name: group.name, typeLabel: group.desktop ? "People's computers" : "Cloud provider" }));
  const out: ImpactEdge[] = groups.flatMap((group) => group.apps.map((app) => ({ type: "runs_on", fromId: app.id, toId: group.id })));
  const add = (id: string, name: string, kind: "provider" | "region", typeLabel: string) => {
    if (items.some((item) => item.id === id)) return;
    items.push({ id, name, kind: "platform", ownerTeam: "", criticality: "", description: typeLabel, properties: { derived: true, derived_kind: kind } });
    nodes.push({ id, name, typeLabel });
  };
  const tenants = new Map((extra.tenants ?? []).filter((object) => object.type === "cloud_service").map((object) => [object.id, object]));
  const appIds = new Set(apps.map((app) => app.id));
  for (const tenant of tenants.values()) {
    const provider = tenantGroup(tenant.properties, "");
    if (!provider) continue;
    add(providerId(provider), provider, "provider", "Cloud provider");
    out.push({ type: "runs_on", fromId: tenant.id, toId: providerId(provider) });
  }
  for (const link of extra.links ?? []) {
    if (link.type !== "runs_on" && link.type !== "built_on") continue;
    const tenant = tenants.get(link.to_object_id);
    const region = linkRegion(link.attributes);
    if (!tenant || !region || !appIds.has(link.from_object_id)) continue;
    const provider = tenantGroup(tenant.properties, tenant.name) || tenant.name;
    const id = regionId(provider, region);
    add(id, `${provider} · ${region}`, "region", "Region");
    out.push({ type: "runs_on", fromId: link.from_object_id, toId: id });
  }
  return { items, nodes, edges: out };
}
