/** Kinds, locations, and the unsupported-OS list. One config, same idea as relationshipImpactRules. */

export const infraConfig = {
  runtimeKinds: [
    { key: "physical_server", label: "Physical server", icon: "server" },
    { key: "vm", label: "VM", icon: "vm" },
    { key: "cloud_service", label: "Cloud service", icon: "cloud", managed: true },
    { key: "database", label: "Database", icon: "db" },
    { key: "network_device", label: "Network device", icon: "router" },
    { key: "storage", label: "Storage", icon: "hdd" },
    { key: "end_user_device", label: "End-user device", icon: "laptop" },
  ],
  /** Real compute_runtime_kind values from runtime-utils.ts. Unmapped values stay null. */
  computeRuntimeKindMap: {
    on_prem: "physical_server",
    vm: "vm",
    kubernetes: "cloud_service",
    serverless: "cloud_service",
    container: "cloud_service",
    paas: "cloud_service",
  } as Record<string, string>,
  locations: [
    { key: "office", label: "Office" },
    { key: "data_center", label: "Data center" },
    { key: "cloud_region", label: "Cloud region" },
  ],
  platformKinds: [
    { key: "saas_suite", label: "SaaS suite" },
    { key: "paas", label: "PaaS" },
    { key: "cloud_account", label: "Cloud account" },
    { key: "self_hosted", label: "Self-hosted" },
  ],
  platformHostingLabels: { saas: "SaaS", paas: "PaaS", self_hosted: "Self-hosted", hybrid: "Hybrid" } as Record<string, string>,
  /** hosting_model -> platform_kind, read-only. Never written. */
  platformKindFromHosting: { saas: "saas_suite", paas: "paas", self_hosted: "self_hosted" } as Record<string, string>,
  status: { endsSoonDays: 90 },
  eolOs: [
    { name: "Windows Server", version: "2012 R2", ends: "2023-10-10" }, // https://learn.microsoft.com/lifecycle
    { name: "Windows Server", version: "2012", ends: "2023-10-10" },
    { name: "Windows Server", version: "2016", ends: "2027-01-12" },
    { name: "SQL Server", version: "2016", ends: "2026-07-14" },
    { name: "IBM i", version: "7.3", ends: "2023-09-30" }, // https://www.ibm.com/support/pages/ibm-i-release-lifecycle
    { name: "Windows 11", version: "23H2", ends: "2026-11-10" },
    { name: "Ubuntu", version: "22.04", ends: "2027-04-30", match: "prefix" as const }, // https://ubuntu.com/about/release-cycle
  ],
  noHostLinked: {
    types: ["application", "solution"],
    hostingModels: ["on_premise", "hybrid"],
    edgeKinds: ["runs_on", "built_on"],
  },
  hostEdgeKinds: ["runs_on", "built_on"],
} as const;

export const RUNTIME_KIND_KEYS = infraConfig.runtimeKinds.map((kind) => kind.key);
export const PLATFORM_KIND_KEYS = infraConfig.platformKinds.map((kind) => kind.key);
export const LOCATION_KEYS = infraConfig.locations.map((location) => location.key);

/** The split is the model navigation. There is no workspace flag store. */
export const infraSplitEnabled = true;

export function runtimeKindLabel(key: string | null | undefined): string {
  return infraConfig.runtimeKinds.find((kind) => kind.key === key)?.label ?? "";
}

export function platformKindLabel(key: string | null | undefined): string {
  return infraConfig.platformKinds.find((kind) => kind.key === key)?.label ?? "";
}

export function locationLabel(key: string | null | undefined): string {
  return infraConfig.locations.find((location) => location.key === key)?.label ?? "";
}

export function mapComputeKind(computeRuntimeKind: string | null | undefined): string | null {
  if (!computeRuntimeKind) return null;
  return infraConfig.computeRuntimeKindMap[computeRuntimeKind] ?? null;
}

export function isManagedKind(kind: string | null | undefined): boolean {
  return infraConfig.runtimeKinds.some((item) => item.key === kind && "managed" in item && item.managed);
}
