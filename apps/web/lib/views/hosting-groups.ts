import { linkRegion, tenantGroup } from "@/lib/hosting/cloud";
import { providerGroups, type HostingLink, type ProviderApp, type TenantObject } from "@/lib/views/providers";
import type { ImpactEdge } from "@/lib/impact/relationship-impact";

export const NO_REGION = "Region not recorded";
export const NO_TENANT = "No tenant recorded";

export type RegionBucket = { region: string; apps: { id: string; name: string }[] };
export type TenantBucket = { id: string | null; name: string; meta: string; regions: RegionBucket[] };
export type ProviderBucket = { provider: string; tenants: TenantBucket[]; apps: number };

/**
 * Hosting & location, cloud part: Provider › Tenant/account › Region › apps.
 * Tenants are platform records (one per tenant/account); regions come from the runs-on link.
 * SaaS apps with no tenant link keep the derived provider grouping under "No tenant recorded".
 */
export function hostingGroups(apps: ProviderApp[], tenants: TenantObject[], links: HostingLink[], edges: ImpactEdge[]): ProviderBucket[] {
  const providers = new Map<string, ProviderBucket>();
  const bucket = (provider: string) => {
    const found = providers.get(provider) ?? { provider, tenants: [], apps: 0 };
    providers.set(provider, found);
    return found;
  };
  const appById = new Map(apps.map((app) => [app.id, app]));
  for (const tenant of tenants.filter((object) => object.type === "cloud_service")) {
    const props = tenant.properties ?? {};
    const provider = tenantGroup(props, tenant.name) || "Other";
    const regions = new Map<string, RegionBucket>();
    for (const link of links) {
      if ((link.type !== "runs_on" && link.type !== "built_on") || link.to_object_id !== tenant.id) continue;
      const app = appById.get(link.from_object_id);
      if (!app) continue;
      const region = linkRegion(link.attributes) || NO_REGION;
      const entry = regions.get(region) ?? { region, apps: [] };
      if (!entry.apps.some((item) => item.id === app.id)) entry.apps.push({ id: app.id, name: app.name });
      regions.set(region, entry);
    }
    const kind = String(props.platform_kind ?? "");
    const meta = [kind === "cloud_account" ? "Our cloud" : kind === "saas_suite" ? "SaaS tenant" : "Platform", String(props.tenant_id ?? "")].filter(Boolean).join(" · ");
    const sorted = [...regions.values()].sort((a, b) => Number(a.region === NO_REGION) - Number(b.region === NO_REGION) || a.region.localeCompare(b.region));
    const group = bucket(provider);
    group.tenants.push({ id: tenant.id, name: tenant.name, meta, regions: sorted });
    group.apps += sorted.reduce((sum, region) => sum + region.apps.length, 0);
  }
  for (const derived of providerGroups(apps, edges).filter((group) => !group.desktop)) {
    const group = bucket(derived.name);
    group.tenants.push({ id: null, name: NO_TENANT, meta: "SaaS · provider from the catalogue", regions: [{ region: NO_REGION, apps: derived.apps }] });
    group.apps += derived.apps.length;
  }
  return [...providers.values()].sort((a, b) => b.apps - a.apps || a.provider.localeCompare(b.provider));
}
