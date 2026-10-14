import { providerLabel, regionLabel, tenantProvider, type CustomRegion } from "@/lib/hosting/cloud";
import { providerGroups, tenantLinkInfo, type HostingLink, type ProviderApp, type TenantObject } from "@/lib/views/providers";
import type { ImpactEdge } from "@/lib/impact/relationship-impact";

export const NO_REGION = "Region not recorded";
export const NO_TENANT = "No tenant recorded";

export type RegionBucket = { key: string; region: string; apps: { id: string; name: string }[] };
export type TenantBucket = { id: string | null; name: string; meta: string; regions: RegionBucket[] };
export type ProviderBucket = { provider: string; tenants: TenantBucket[]; apps: number };

/**
 * Hosting & location, cloud part: Provider › Tenant/account › Region › apps. Providers are the
 * fixed list; tenants are platform records; the region comes from the runs-on link (by key, or
 * old free text). SaaS apps with no tenant link keep the derived provider under "No tenant recorded".
 */
export function hostingGroups(apps: ProviderApp[], tenants: TenantObject[], links: HostingLink[], edges: ImpactEdge[], custom: CustomRegion[] = []): ProviderBucket[] {
  const providers = new Map<string, ProviderBucket>();
  const bucket = (provider: string) => {
    const found = providers.get(provider) ?? { provider, tenants: [], apps: 0 };
    providers.set(provider, found);
    return found;
  };
  const appName = new Map(apps.map((app) => [app.id, app.name]));
  const info = tenantLinkInfo(apps, tenants, links, custom);
  for (const tenant of tenants.filter((object) => object.type === "cloud_service")) {
    const props = tenant.properties ?? {};
    const regions = new Map<string, RegionBucket>();
    for (const link of info.filter((item) => item.tenant.id === tenant.id)) {
      const label = link.regionKey ? regionLabel(link.regionKey, custom) : NO_REGION;
      const entry = regions.get(link.regionKey) ?? { key: link.regionKey, region: label, apps: [] };
      if (!entry.apps.some((item) => item.id === link.appId)) entry.apps.push({ id: link.appId, name: appName.get(link.appId) ?? "" });
      regions.set(link.regionKey, entry);
    }
    const kind = String(props.platform_kind ?? "");
    const meta = [kind === "cloud_account" ? "Our cloud" : kind === "saas_suite" ? "SaaS tenant" : "Platform", String(props.tenant_id ?? "")].filter(Boolean).join(" · ");
    const sorted = [...regions.values()].sort((a, b) => Number(!a.key) - Number(!b.key) || a.region.localeCompare(b.region));
    const group = bucket(providerLabel(tenantProvider(props, tenant.name)));
    group.tenants.push({ id: tenant.id, name: tenant.name, meta, regions: sorted });
    group.apps += sorted.reduce((sum, region) => sum + region.apps.length, 0);
  }
  for (const derived of providerGroups(apps, edges).filter((group) => !group.desktop)) {
    const group = bucket(derived.name);
    group.tenants.push({ id: null, name: NO_TENANT, meta: "SaaS · provider from the catalogue", regions: [{ key: "", region: NO_REGION, apps: derived.apps }] });
    group.apps += derived.apps.length;
  }
  return [...providers.values()].sort((a, b) => b.apps - a.apps || a.provider.localeCompare(b.provider));
}
