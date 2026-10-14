/**
 * "Our cloud" and tenant/region data for "Where does it run?". Nothing here needs a migration:
 *   - application.properties.hosting_model = "own_cloud" (new value; old "cloud" still reads as SaaS)
 *   - a tenant / account / project is an existing platform record (cloud_service), ONE per tenant:
 *     properties.platform_kind ("cloud_account" for our cloud, "saas_suite" for a SaaS tenant),
 *     properties.vendor (platform vendor code), properties.cloud_provider (azure|aws|gcp|other),
 *     properties.tenant_id (tenant / subscription / account / project ID), plus owner and cost
 *     lines as on any platform
 *   - the app → tenant runs_on link carries an optional attributes.region (free text)
 */
import { normalizeTerm } from "@/lib/setup/match-tools";
import { PLATFORM_VENDOR_LABEL } from "@/lib/platform-utils";

export type CloudProvider = "azure" | "aws" | "gcp" | "other";

export const CLOUD_PROVIDERS: { id: CloudProvider; label: string; vendor: string; group: string; tenantWord: string }[] = [
  { id: "azure", label: "Azure", vendor: "microsoft", group: "Microsoft", tenantWord: "tenant" },
  { id: "aws", label: "AWS", vendor: "amazon", group: "Amazon Web Services", tenantWord: "account" },
  { id: "gcp", label: "Google Cloud", vendor: "google", group: "Google", tenantWord: "project" },
  { id: "other", label: "Other", vendor: "other", group: "Other cloud", tenantWord: "account" },
];

const REGIONS: Record<string, string[]> = {
  azure: ["Canada Central", "Canada East", "East US", "East US 2", "Central US", "West US 2", "North Europe", "West Europe", "UK South", "Australia East"],
  aws: ["ca-central-1", "ca-west-1", "us-east-1", "us-east-2", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-2"],
  gcp: ["northamerica-northeast1", "northamerica-northeast2", "us-central1", "us-east1", "europe-west1", "australia-southeast1"],
  microsoft: ["Canada", "Canada Central", "Canada East", "United States", "Europe", "United Kingdom", "Australia"],
  google: ["northamerica-northeast1", "us-central1", "europe-west1", "United States", "Europe"],
  amazon: ["ca-central-1", "us-east-1", "us-west-2", "eu-west-1"],
  salesforce: ["Canada (Hyperforce)", "United States (Hyperforce)", "Europe (Hyperforce)", "NA", "CA", "EU"],
};

/** Region suggestions for a cloud provider id or a SaaS vendor name. Free text is always allowed. */
export function regionSuggestions(providerOrVendor: string | null | undefined): string[] {
  const key = normalizeTerm(providerOrVendor ?? "").split(" ")[0] ?? "";
  return REGIONS[key] ?? [];
}

export const cloudProvider = (id: unknown) => CLOUD_PROVIDERS.find((provider) => provider.id === id);

/** "Azure tenant", "AWS account", "Google Cloud project"; SaaS: "Microsoft tenant". */
export function defaultTenantName(provider: CloudProvider | null, vendor?: string): string {
  if (provider) {
    const item = cloudProvider(provider)!;
    return provider === "other" ? "Cloud account" : `${item.label} ${item.tenantWord}`;
  }
  return vendor ? `${vendor} tenant` : "Tenant";
}

export type TenantRecord = { id: string; name: string; type: string; properties?: Record<string, unknown> | null };
export type TenantOption = { id: string; name: string; group: string };

/** The provider a tenant / platform belongs to, as one label shared with SaaS vendors. */
export function tenantGroup(properties: Record<string, unknown> | null | undefined, fallback = ""): string {
  const props = properties ?? {};
  const provider = cloudProvider(props.cloud_provider);
  if (provider) return provider.group;
  const vendor = String(props.vendor ?? "").trim();
  const label = PLATFORM_VENDOR_LABEL[vendor] ?? vendor;
  return providerGroupLabel(label || fallback);
}

/** SaaS vendor names and cloud names fold to one provider label (Amazon → Amazon Web Services). */
export function providerGroupLabel(name: string): string {
  const key = normalizeTerm(name);
  if (!key) return "";
  if (key === "amazon" || key === "aws" || key.startsWith("amazon web")) return "Amazon Web Services";
  if (key === "azure" || key.startsWith("microsoft")) return "Microsoft";
  if (key.startsWith("google")) return "Google";
  return name.trim();
}

/** Platform records an app can run on, optionally narrowed to one provider. */
export function tenantOptions(objects: TenantRecord[], group?: string): TenantOption[] {
  return objects
    .filter((object) => object.type === "cloud_service")
    .map((object) => ({ id: object.id, name: object.name, group: tenantGroup(object.properties, object.name) }))
    .filter((option) => !group || option.group === group)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Properties for a new tenant record. */
export function tenantProperties(provider: CloudProvider | null, vendor?: string): Record<string, unknown> {
  if (provider) {
    const item = cloudProvider(provider)!;
    return { platform_kind: "cloud_account", vendor: item.vendor, cloud_provider: provider };
  }
  const code = Object.entries(PLATFORM_VENDOR_LABEL).find(([, label]) => normalizeTerm(label) === normalizeTerm(vendor ?? ""))?.[0];
  return { platform_kind: "saas_suite", hosting_model: "saas", vendor: code ?? vendor ?? "" };
}

/** Reuse a tenant by name (case/space-insensitive) instead of creating a duplicate. */
export function findTenant<T extends { name: string }>(tenants: T[], name: string): T | undefined {
  const key = normalizeTerm(name);
  return key ? tenants.find((tenant) => normalizeTerm(tenant.name) === key) : undefined;
}

/** "We built it ourselves" and self-hostable products suggest Our cloud (a suggestion, not a pick). */
export function suggestsOwnCloud(row: { customBuilt?: boolean; tool?: { hosting?: string } | null }): boolean {
  return Boolean(row.customBuilt) || row.tool?.hosting === "either";
}

/** The optional region on a runs-on link, trimmed; "" when not recorded. */
export function linkRegion(attributes: unknown): string {
  const value = (attributes as { region?: unknown } | null | undefined)?.region;
  return typeof value === "string" ? value.trim() : "";
}

export type HostingDetail = { provider: CloudProvider | null; tenantName: string; tenantId?: string; region: string };
export const EMPTY_DETAIL: HostingDetail = { provider: null, tenantName: "", region: "" };

/**
 * What saving a tenant + region changes for one app: reuse the tenant by id or name (else create
 * it), update the region on the existing link to that tenant, or link it and drop links to other
 * tenants (one tenant per app from this editor).
 */
export function planTenantSave(
  detail: HostingDetail,
  links: { id: string; tenantId: string; region: string }[],
  tenants: TenantOption[],
  choice: "own_cloud" | "saas",
): { tenantId: string | null; createTenant: string | null; updateLinkId: string | null; region: string; removeLinkIds: string[] } {
  const region = detail.region.trim();
  const name = detail.tenantName.trim();
  if (!name) {
    // SaaS with no tenant named: keep links as they are; a region needs a link to sit on.
    return { tenantId: null, createTenant: null, updateLinkId: null, region, removeLinkIds: choice === "saas" ? [] : links.map((link) => link.id) };
  }
  const known = (detail.tenantId && tenants.find((tenant) => tenant.id === detail.tenantId)) || findTenant(tenants, name);
  const same = known ? links.find((link) => link.tenantId === known.id) : undefined;
  return {
    tenantId: same ? null : known?.id ?? null,
    createTenant: known ? null : name,
    updateLinkId: same && same.region !== region ? same.id : null,
    region,
    removeLinkIds: links.filter((link) => link.id !== same?.id).map((link) => link.id),
  };
}
