/**
 * Clouds, tenants and regions for "Where does it run?".
 *   - Provider: a fixed list (cloud-regions.json, mirrored in the API): Azure, AWS, Google Cloud,
 *     Microsoft 365, Google Workspace, Salesforce, Other.
 *   - Region: belongs to the PROVIDER and is shared by all its tenants. Built-in regions ship in
 *     cloud-regions.json; a workspace may add custom regions per provider (cloud_regions, 051).
 *     Referenced by key: "azure:canadacentral" or "custom:<uuid>".
 *   - Tenant / account: an existing platform record (cloud_service), many per provider:
 *     properties.cloud_provider, platform_kind (cloud_account | saas_suite), tenant_id,
 *     annual_cost, owner, and an optional regions_used list (sorted first in the region picker).
 *   - App -> tenant runs_on link: attributes.region_key. Links from before 051 carry free text in
 *     attributes.region; it is resolved against the provider's regions when read.
 */
import catalog from "./cloud-regions.json";
import { normalizeTerm } from "@/lib/setup/match-tools";

export type CloudProvider = "azure" | "aws" | "gcp" | "m365" | "google_workspace" | "salesforce" | "other";
export type ProviderInfo = { id: CloudProvider; label: string; kind: "cloud" | "saas" | "any"; vendor: string; tenantWord: string };
export type Region = { key: string; name: string; note: string; provider: CloudProvider; custom?: boolean };
export type CustomRegion = { id: string; key: string; provider: string; name: string; usage?: number };

export const PROVIDERS = catalog.providers as ProviderInfo[];
/** "Our cloud" chips. */
export const CLOUD_PROVIDERS = PROVIDERS.filter((p) => p.kind !== "saas");
/** SaaS tenant chips. */
export const SAAS_PROVIDERS = PROVIDERS.filter((p) => p.kind !== "cloud");
export const PROVIDER_CASES = catalog.provider_cases as [Record<string, unknown>, string, CloudProvider][];

const STANDARD: Region[] = Object.entries(catalog.regions).flatMap(([provider, rows]) =>
  (rows as { key: string; name: string; note: string }[]).map((row) => ({ key: row.key, name: row.name, note: row.note, provider: provider as CloudProvider })),
);
const ALIASES = new Map<string, string>(
  Object.entries(catalog.regions).flatMap(([provider, rows]) =>
    (rows as { key: string; name: string; aliases: string[] }[]).flatMap((row) => [row.name, ...row.aliases].map((alias) => [`${provider}|${clean(alias)}`, row.key] as [string, string])),
  ),
);
const BY_KEY = new Map(STANDARD.map((region) => [region.key, region]));

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export const providerInfo = (id: unknown): ProviderInfo | undefined => PROVIDERS.find((p) => p.id === id);
export const providerLabel = (id: unknown): string => providerInfo(id)?.label ?? "Other";
export const isProvider = (id: unknown): id is CloudProvider => Boolean(providerInfo(id));

/** Built-in regions of one provider, in the catalogue's order. */
export function standardRegions(provider: CloudProvider | null | undefined): Region[] {
  return STANDARD.filter((region) => region.provider === provider);
}

const asRegion = (row: CustomRegion): Region => ({ key: row.key, name: row.name, note: "", provider: (isProvider(row.provider) ? row.provider : "other"), custom: true });

/** Built-in then custom regions of one provider. */
export function providerRegions(provider: CloudProvider | null | undefined, custom: CustomRegion[] = []): Region[] {
  return [...standardRegions(provider), ...custom.filter((row) => row.provider === provider).map(asRegion)];
}

export function regionByKey(key: string | null | undefined, custom: CustomRegion[] = []): Region | undefined {
  if (!key) return undefined;
  const found = BY_KEY.get(key);
  if (found) return found;
  const row = custom.find((item) => item.key === key);
  return row ? asRegion(row) : undefined;
}

/** A typed name → the provider's built-in region (name or alias) or custom region, case-insensitively. */
export function matchRegion(provider: CloudProvider, text: string, custom: CustomRegion[] = []): string | null {
  const key = clean(text);
  if (!key) return null;
  return ALIASES.get(`${provider}|${key}`) ?? custom.find((row) => row.provider === provider && clean(row.name) === key)?.key ?? null;
}

const LEGACY = "legacy:";

/**
 * The region on an app → tenant link: attributes.region_key, else the pre-051 free text resolved
 * against the provider's regions, else "legacy:<text>" (shown literally). "" when none.
 */
export function linkRegionKey(attributes: unknown, provider: CloudProvider, custom: CustomRegion[] = []): string {
  const attrs = (attributes ?? {}) as { region_key?: unknown; region?: unknown };
  if (typeof attrs.region_key === "string" && attrs.region_key) return attrs.region_key;
  const text = typeof attrs.region === "string" ? attrs.region.trim().replace(/\s+/g, " ") : "";
  if (!text) return "";
  return matchRegion(provider, text, custom) ?? `${LEGACY}${text}`;
}

export const isLegacyKey = (key: string) => key.startsWith(LEGACY);

/** What a region key shows as: "Canada Central", "ca-central-1", a custom name, or the old text. */
export function regionLabel(key: string, custom: CustomRegion[] = []): string {
  if (!key) return "";
  if (isLegacyKey(key)) return key.slice(LEGACY.length);
  return regionByKey(key, custom)?.name ?? "Unknown region";
}

/** Attributes to write for a picked region (never the legacy pseudo-key). */
export function regionAttributes(regionKey: string | null | undefined): Record<string, string> {
  return regionKey && !isLegacyKey(regionKey) ? { region_key: regionKey } : {};
}

/** The fixed provider of a tenant/account record (same rules as the API and migration 051). */
export function tenantProvider(properties: Record<string, unknown> | null | undefined, name = ""): CloudProvider {
  const props = properties ?? {};
  if (isProvider(props.cloud_provider)) return props.cloud_provider;
  const n = name.toLowerCase();
  if (n.includes("azure")) return "azure";
  if (/\baws\b|amazon web services/.test(n)) return "aws";
  if (/google cloud|\bgcp\b/.test(n)) return "gcp";
  if (/microsoft 365|office 365|\bm365\b|\bo365\b/.test(n)) return "m365";
  if (/google workspace|g suite/.test(n)) return "google_workspace";
  if (n.includes("salesforce")) return "salesforce";
  const vendor = String(props.vendor ?? "").toLowerCase();
  const cloud = props.platform_kind === "cloud_account";
  if (vendor === "microsoft") return cloud ? "azure" : "m365";
  if (vendor === "amazon" || vendor === "aws") return "aws";
  if (vendor === "google") return cloud ? "gcp" : "google_workspace";
  if (vendor === "salesforce") return "salesforce";
  return "other";
}

/** The SaaS provider for a catalogue vendor (Microsoft → Microsoft 365); null when not on the list. */
export function providerForVendor(vendor: string | null | undefined): CloudProvider | null {
  const key = normalizeTerm(vendor ?? "");
  if (!key) return null;
  if (key.startsWith("microsoft")) return "m365";
  if (key.startsWith("google")) return "google_workspace";
  if (key.startsWith("salesforce")) return "salesforce";
  if (key === "amazon" || key === "aws" || key.startsWith("amazon web")) return "aws";
  return null;
}

/** "Azure tenant", "AWS account", "Google Cloud project", "Salesforce org", "Cloud account". */
export function defaultTenantName(provider: CloudProvider | null | undefined): string {
  const item = providerInfo(provider);
  if (!item || item.id === "other") return "Cloud account";
  return `${item.label} ${item.tenantWord}`;
}

export type TenantRecord = { id: string; name: string; type: string; properties?: Record<string, unknown> | null };
export type LinkRecord = { id?: string; type: string; from_object_id: string; to_object_id: string; attributes?: Record<string, unknown> | null };
/** A tenant for the pickers; regionKeys = its regions used + regions its apps already run in. */
export type TenantOption = { id: string; name: string; provider: CloudProvider; regionKeys: string[] };

export const isTenantLink = (link: { type: string }) => link.type === "runs_on" || link.type === "built_on";

/** Platform records (tenants / accounts), optionally for one provider, with the regions they use. */
export function tenantOptions(objects: TenantRecord[], links: LinkRecord[] = [], custom: CustomRegion[] = [], provider?: CloudProvider | null): TenantOption[] {
  return objects
    .filter((object) => object.type === "cloud_service")
    .map((object) => {
      const p = tenantProvider(object.properties, object.name);
      const used = Array.isArray(object.properties?.regions_used) ? (object.properties!.regions_used as unknown[]).filter((k): k is string => typeof k === "string") : [];
      const linked = links.filter((link) => isTenantLink(link) && link.to_object_id === object.id).map((link) => linkRegionKey(link.attributes, p, custom)).filter((k) => k && !isLegacyKey(k));
      return { id: object.id, name: object.name, provider: p, regionKeys: [...new Set([...used, ...linked])] };
    })
    .filter((option) => !provider || option.provider === provider)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Region picker order: this tenant's regions first, then the provider's other built-in, then custom. */
export function regionChoices(provider: CloudProvider | null | undefined, tenant: TenantOption | undefined, custom: CustomRegion[] = []) {
  const all = providerRegions(provider, custom);
  const first = new Set(tenant?.regionKeys ?? []);
  return {
    used: all.filter((region) => first.has(region.key)),
    standard: all.filter((region) => !region.custom && !first.has(region.key)),
    custom: all.filter((region) => region.custom && !first.has(region.key)),
  };
}

/** Properties for a new tenant record. */
export function tenantProperties(provider: CloudProvider, mode: "own_cloud" | "saas"): Record<string, unknown> {
  const vendor = providerInfo(provider)?.vendor ?? "other";
  return mode === "own_cloud"
    ? { platform_kind: "cloud_account", vendor, cloud_provider: provider }
    : { platform_kind: "saas_suite", hosting_model: "saas", vendor, cloud_provider: provider };
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

export type HostingDetail = {
  provider: CloudProvider | null;
  tenantName: string;
  tenantId?: string;
  regionKey: string | null;
  /** Picked a new tenant typed on another card ("X (new)"): saved as the same one record. */
  tenantShared?: boolean;
};
export const EMPTY_DETAIL: HostingDetail = { provider: null, tenantName: "", regionKey: null };

/**
 * What saving provider / tenant / region changes for one app: reuse the tenant by id or name (else
 * create it), update the region on the existing link to that tenant, or link it and drop links to
 * other tenants (one tenant per app from this editor).
 */
export function planTenantSave(
  detail: HostingDetail,
  links: { id: string; tenantId: string; regionKey: string }[],
  tenants: { id: string; name: string }[],
  choice: "own_cloud" | "saas",
): { tenantId: string | null; createTenant: string | null; updateLinkId: string | null; regionKey: string; removeLinkIds: string[] } {
  const regionKey = detail.regionKey ?? "";
  const name = detail.tenantName.trim();
  if (!name && !detail.tenantId) {
    // SaaS with no tenant named: keep links as they are; a region needs a link to sit on.
    return { tenantId: null, createTenant: null, updateLinkId: null, regionKey, removeLinkIds: choice === "saas" ? [] : links.map((link) => link.id) };
  }
  const known = (detail.tenantId && tenants.find((tenant) => tenant.id === detail.tenantId)) || findTenant(tenants, name);
  const same = known ? links.find((link) => link.tenantId === known.id) : undefined;
  return {
    tenantId: same ? null : known?.id ?? null,
    createTenant: known ? null : name,
    updateLinkId: same && same.regionKey !== regionKey ? same.id : null,
    regionKey,
    removeLinkIds: links.filter((link) => link.id !== same?.id).map((link) => link.id),
  };
}
