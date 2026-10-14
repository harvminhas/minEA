/**
 * What each Platforms & cloud row IS, in the current hosting model (tenants from 8ce967e/f1c2030):
 * a cloud tenant/account on a provider, a SaaS suite (optionally on a SaaS provider like Microsoft 365),
 * a PaaS, or a self-hosted platform. Read-only: derived from platform_kind, cloud_provider, the name
 * and hosting_model; nothing is written.
 */
import { infraConfig } from "@/lib/infra/infraConfig";
import { providerInfo, regionLabel, tenantProvider, type CloudProvider, type CustomRegion } from "@/lib/hosting/cloud";

export type PlatformKindGroup = "tenant" | "saas_suite" | "paas" | "self_hosted" | "unset";
export type PlatformHostingKey = "cloud" | "saas" | "paas" | "self_hosted" | "hybrid" | "unset";

export const PLATFORM_KIND_FILTERS: { key: PlatformKindGroup; label: string }[] = [
  { key: "tenant", label: "Cloud tenants & accounts" },
  { key: "saas_suite", label: "SaaS suites" },
  { key: "paas", label: "PaaS" },
  { key: "self_hosted", label: "Self-hosted platforms" },
  { key: "unset", label: "Kind not set" },
];

export const PLATFORM_HOSTING_FILTERS: { key: PlatformHostingKey; label: string }[] = [
  { key: "cloud", label: "Public cloud" },
  { key: "saas", label: "SaaS" },
  { key: "paas", label: "PaaS" },
  { key: "self_hosted", label: "Self-hosted" },
  { key: "hybrid", label: "Hybrid" },
  { key: "unset", label: "Hosting not set" },
];

const HOSTING_KEY: Record<string, PlatformHostingKey> = {
  saas: "saas",
  paas: "paas",
  self_hosted: "self_hosted",
  on_premise: "self_hosted",
  private_cloud: "self_hosted",
  hybrid: "hybrid",
  public_cloud: "cloud",
  cloud: "cloud",
};

export type PlatformKindView = {
  group: PlatformKindGroup;
  /** Chip text: "Tenant · Azure", "SaaS suite · Microsoft 365", "PaaS", "Self-hosted platform"; "" when not set. */
  chip: string;
  /** True when the kind is read from the provider, name or hosting model rather than saved. */
  inferred: boolean;
  provider: CloudProvider | null;
  hostingKey: PlatformHostingKey;
  /** Hosting column: "Azure · Canada Central +1", "SaaS", "PaaS", "Self-hosted"; "" when not set. */
  hosting: string;
};

type PlatformLike = { name: string; properties?: Record<string, unknown> | null };

function namedProvider(props: Record<string, unknown>, name: string): CloudProvider | null {
  // Saved provider, else the name ("Azure tenant", "Microsoft 365"); never the bare vendor here.
  const provider = tenantProvider({ cloud_provider: props.cloud_provider }, name);
  return provider === "other" ? null : provider;
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function regionsText(provider: CloudProvider | null, regionKeys: string[], custom: CustomRegion[]): string {
  const names = regionKeys.map((key) => regionLabel(key, custom)).filter((name) => name && name !== "Unknown region");
  if (names.length === 0) return "";
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

/** regionKeys: the regions this record uses (tenantOptions: regions_used + regions its apps run in). */
export function platformKindView(object: PlatformLike, regionKeys: string[] = [], custom: CustomRegion[] = []): PlatformKindView {
  const props = (object.properties ?? {}) as Record<string, unknown>;
  const saved = typeof props.platform_kind === "string" ? props.platform_kind : "";
  const hostingModel = typeof props.hosting_model === "string" ? props.hosting_model : "";
  const named = namedProvider(props, object.name);
  const namedKind = named ? providerInfo(named)?.kind : undefined;

  let group: PlatformKindGroup = "unset";
  if (saved === "cloud_account") group = "tenant";
  else if (saved === "saas_suite" || saved === "paas" || saved === "self_hosted") group = saved;
  else if (namedKind === "cloud") group = "tenant";
  else if (namedKind === "saas") group = "saas_suite";
  else {
    const fromHosting = infraConfig.platformKindFromHosting[hostingModel];
    if (fromHosting === "saas_suite" || fromHosting === "paas" || fromHosting === "self_hosted") group = fromHosting;
  }
  const inferred = group !== "unset" && !["cloud_account", "saas_suite", "paas", "self_hosted"].includes(saved);

  // A tenant's provider may also come from its vendor (Microsoft cloud account -> Azure).
  const provider = group === "tenant" ? tenantProvider(props, object.name) : group === "saas_suite" && namedKind === "saas" ? named : null;
  const info = provider && provider !== "other" ? providerInfo(provider) : undefined;
  const regions = regionsText(provider, regionKeys, custom);

  let chip = "";
  if (group === "tenant") chip = info ? `${cap(info.tenantWord)} · ${info.label}` : "Cloud account";
  else if (group === "saas_suite") chip = info ? `SaaS suite · ${info.label}` : "SaaS suite";
  else if (group === "paas") chip = "PaaS";
  else if (group === "self_hosted") chip = "Self-hosted platform";

  let hostingKey: PlatformHostingKey = HOSTING_KEY[hostingModel] ?? "unset";
  if (group === "tenant") hostingKey = "cloud";
  else if (group === "saas_suite" && hostingKey === "unset") hostingKey = "saas";

  let hosting = "";
  if (hostingKey === "cloud") hosting = [info?.label ?? "Public cloud", regions].filter(Boolean).join(" · ");
  else if (hostingKey !== "unset") {
    const label = PLATFORM_HOSTING_FILTERS.find((item) => item.key === hostingKey)!.label;
    hosting = [label, regions].filter(Boolean).join(" · ");
  }
  return { group, chip, inferred, provider: info ? provider : null, hostingKey, hosting };
}

/** Filter options for the values present, in fixed order (so a filter never empties the list). */
export function presentOptions<K extends string>(all: { key: K; label: string }[], present: K[]): { key: K; label: string }[] {
  const seen = new Set(present);
  return all.filter((item) => seen.has(item.key));
}
