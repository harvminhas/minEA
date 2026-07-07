import type {
  ApplicationProperties,
  CloudServiceProperties,
  MinEAObject,
  ModelProperties,
  Relationship,
} from "@minea/types";
import { formatSystemCategoryLabel } from "@/lib/system-category";
import {
  filterEnterprisePlatforms,
  isSystemPlatformRelationship,
} from "@/lib/platform-relationship-utils";
import { platformTypeLabel } from "@/lib/platform-utils";
import { isComputeRuntime, runtimeKindLabel } from "@/lib/runtime-utils";
import {
  systemObjectPlatformLinks,
  systemObjectRuntimeLinks,
} from "@/lib/system-drawer-utils";

export type FoundationsTab = "platform" | "runtime" | "integration";

export interface FoundationSystemEntry {
  system: MinEAObject;
  detailNote?: string;
}

export interface FoundationGroup {
  key: string;
  label: string;
  variant: "default" | "custom" | "muted";
  sortOrder: number;
  systems: FoundationSystemEntry[];
}

export interface FoundationsSummary {
  totalSystems: number;
  systemsMapped: number;
  customDevelopment: number;
  foundationTypesInUse: number;
}

export interface FoundationsData {
  systems: MinEAObject[];
  platformsById: Map<string, MinEAObject>;
  runtimesById: Map<string, MinEAObject>;
  relationships: Relationship[];
}

const PLATFORM_GROUP_ORDER: Record<string, number> = {
  crm: 10,
  erp: 20,
  commerce: 30,
  itsm: 40,
  bpm: 50,
  low_code: 60,
  custom_dev: 70,
  not_set: 999,
};

const RUNTIME_GROUP_ORDER: Record<string, number> = {
  kubernetes: 10,
  serverless: 20,
  container: 30,
  vm: 40,
  paas: 50,
  on_prem: 60,
  not_set: 999,
};

function systemAppProps(system: MinEAObject): ApplicationProperties {
  return (system.properties ?? {}) as ApplicationProperties;
}

function systemDetailNote(system: MinEAObject): string | undefined {
  const desc = system.description?.trim();
  if (desc) {
    const first = desc.split(/[.!?\n]/)[0]?.trim();
    if (first && first.length <= 96) return first;
    if (first) return `${first.slice(0, 93)}…`;
  }
  const vendor = systemAppProps(system).vendor?.trim();
  return vendor || undefined;
}

function resolvePlatformForSystem(
  system: MinEAObject,
  platformsById: Map<string, MinEAObject>,
  relationships: Relationship[]
): MinEAObject | null {
  for (const link of systemObjectPlatformLinks(system.id, relationships)) {
    const platform = platformsById.get(link.objectId);
    if (platform) return platform;
  }

  const ref = systemAppProps(system).platform;
  if (ref?.platform_id) {
    return platformsById.get(ref.platform_id) ?? null;
  }

  for (const rel of relationships) {
    if (isSystemPlatformRelationship(rel, system.id)) {
      return platformsById.get(rel.to_object_id) ?? null;
    }
  }

  return null;
}

function resolveRuntimeForSystem(
  system: MinEAObject,
  runtimesById: Map<string, MinEAObject>,
  relationships: Relationship[]
): MinEAObject | null {
  for (const link of systemObjectRuntimeLinks(system.id, relationships)) {
    const runtime = runtimesById.get(link.objectId);
    if (runtime) return runtime;
  }
  return null;
}

function platformGroupMeta(
  system: MinEAObject,
  platform: MinEAObject | null
): { key: string; label: string; variant: FoundationGroup["variant"]; sortOrder: number } {
  const props = systemAppProps(system);
  const isCustomBuilt = Boolean(props.is_custom_built);

  if (platform) {
    const platformProps = platform.properties as CloudServiceProperties;
    const platformType = platformProps.platform_type;

    if (platformType === "custom_dev") {
      return {
        key: "custom_dev",
        label: "CUSTOM DEVELOPMENT",
        variant: "custom",
        sortOrder: PLATFORM_GROUP_ORDER.custom_dev,
      };
    }

    if (platformType === "crm") {
      return {
        key: "crm",
        label: "CRM FOUNDATION",
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER.crm,
      };
    }
    if (platformType === "erp") {
      return {
        key: "erp",
        label: "ERP FOUNDATION",
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER.erp,
      };
    }
    if (platformType === "itsm") {
      return {
        key: "itsm",
        label: "ITSM FOUNDATION",
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER.itsm,
      };
    }
    if (platformType === "bpm") {
      return {
        key: "bpm",
        label: "BPM / WORKFLOW",
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER.bpm,
      };
    }
    if (platformType === "low_code") {
      return {
        key: "low_code",
        label: "LOW-CODE FOUNDATION",
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER.low_code,
      };
    }

    const category = formatSystemCategoryLabel(props.category, props);
    if (category === "Commerce") {
      return {
        key: "commerce",
        label: "COMMERCE",
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER.commerce,
      };
    }

    if (platformType === "other" && platformProps.platform_type_other?.trim()) {
      const label = platformProps.platform_type_other.trim().toUpperCase();
      return { key: `other:${label}`, label, variant: "default", sortOrder: 80 };
    }

    const typeLabel = platformTypeLabel(platformProps);
    if (typeLabel) {
      const label = typeLabel.toUpperCase().includes("FOUNDATION")
        ? typeLabel.toUpperCase()
        : `${typeLabel.toUpperCase()} FOUNDATION`;
      return {
        key: platformType ?? platform.id,
        label,
        variant: "default",
        sortOrder: PLATFORM_GROUP_ORDER[platformType ?? ""] ?? 85,
      };
    }
  }

  const category = formatSystemCategoryLabel(props.category, props);
  if (category === "Commerce") {
    return {
      key: "commerce",
      label: "COMMERCE",
      variant: "default",
      sortOrder: PLATFORM_GROUP_ORDER.commerce,
    };
  }

  if (isCustomBuilt) {
    return {
      key: "custom_dev",
      label: "CUSTOM DEVELOPMENT",
      variant: "custom",
      sortOrder: PLATFORM_GROUP_ORDER.custom_dev,
    };
  }

  return {
    key: "not_set",
    label: "NOT SET",
    variant: "muted",
    sortOrder: PLATFORM_GROUP_ORDER.not_set,
  };
}

function runtimeGroupMeta(
  runtime: MinEAObject | null
): { key: string; label: string; variant: FoundationGroup["variant"]; sortOrder: number } {
  if (!runtime) {
    return {
      key: "not_set",
      label: "NOT SET",
      variant: "muted",
      sortOrder: RUNTIME_GROUP_ORDER.not_set,
    };
  }

  const props = runtime.properties as ModelProperties;
  if (!isComputeRuntime(props)) {
    return {
      key: "not_set",
      label: "NOT SET",
      variant: "muted",
      sortOrder: RUNTIME_GROUP_ORDER.not_set,
    };
  }

  const kind = props.compute_runtime_kind ?? "other";
  if (kind === "on_prem") {
    return {
      key: kind,
      label: "ON-PREM / BARE METAL",
      variant: "default",
      sortOrder: RUNTIME_GROUP_ORDER.on_prem,
    };
  }

  const label = runtimeKindLabel(props).toUpperCase() || kind.toUpperCase();
  return {
    key: kind,
    label,
    variant: "default",
    sortOrder: RUNTIME_GROUP_ORDER[kind] ?? 80,
  };
}

function buildGroups(
  systems: MinEAObject[],
  assignGroup: (system: MinEAObject) => {
    key: string;
    label: string;
    variant: FoundationGroup["variant"];
    sortOrder: number;
  }
): FoundationGroup[] {
  const byKey = new Map<string, FoundationGroup>();

  for (const system of systems) {
    const meta = assignGroup(system);
    const entry: FoundationSystemEntry = {
      system,
      detailNote: systemDetailNote(system),
    };

    const existing = byKey.get(meta.key);
    if (existing) {
      existing.systems.push(entry);
    } else {
      byKey.set(meta.key, {
        key: meta.key,
        label: meta.label,
        variant: meta.variant,
        sortOrder: meta.sortOrder,
        systems: [entry],
      });
    }
  }

  return [...byKey.values()]
    .map((group) => ({
      ...group,
      systems: [...group.systems].sort((a, b) => a.system.name.localeCompare(b.system.name)),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}

export function buildPlatformFoundationGroups(data: FoundationsData): FoundationGroup[] {
  return buildGroups(data.systems, (system) => {
    const platform = resolvePlatformForSystem(system, data.platformsById, data.relationships);
    return platformGroupMeta(system, platform);
  });
}

export function buildRuntimeFoundationGroups(data: FoundationsData): FoundationGroup[] {
  return buildGroups(data.systems, (system) => {
    const runtime = resolveRuntimeForSystem(system, data.runtimesById, data.relationships);
    return runtimeGroupMeta(runtime);
  });
}

export function summarizePlatformFoundations(groups: FoundationGroup[]): FoundationsSummary {
  const totalSystems = groups.reduce((sum, g) => sum + g.systems.length, 0);
  const notSet = groups.find((g) => g.key === "not_set")?.systems.length ?? 0;
  const customDevelopment = groups.find((g) => g.key === "custom_dev")?.systems.length ?? 0;
  const foundationTypesInUse = groups.filter((g) => g.key !== "not_set").length;

  return {
    totalSystems,
    systemsMapped: totalSystems - notSet,
    customDevelopment,
    foundationTypesInUse,
  };
}

export function summarizeRuntimeFoundations(groups: FoundationGroup[]): FoundationsSummary {
  const totalSystems = groups.reduce((sum, g) => sum + g.systems.length, 0);
  const notSet = groups.find((g) => g.key === "not_set")?.systems.length ?? 0;
  const onPrem =
    groups.find((g) => g.key === "on_prem")?.systems.length ??
    groups.find((g) => g.label.includes("ON-PREM"))?.systems.length ??
    0;

  return {
    totalSystems,
    systemsMapped: totalSystems - notSet,
    customDevelopment: onPrem,
    foundationTypesInUse: groups.filter((g) => g.key !== "not_set").length,
  };
}

export function foundationsDataFromLists(opts: {
  applications: MinEAObject[];
  solutions: MinEAObject[];
  technicalCapabilities: MinEAObject[];
  platforms: MinEAObject[];
  runtimes: MinEAObject[];
  relationships: Relationship[];
}): FoundationsData {
  const systems = [...opts.applications, ...opts.solutions, ...opts.technicalCapabilities];
  const platformsById = new Map(
    filterEnterprisePlatforms(opts.platforms).map((p) => [p.id, p] as const)
  );
  const runtimesById = new Map(
    opts.runtimes
      .filter((r) => isComputeRuntime((r.properties ?? {}) as ModelProperties))
      .map((r) => [r.id, r] as const)
  );

  return {
    systems,
    platformsById,
    runtimesById,
    relationships: opts.relationships,
  };
}

export function foundationGroupHeading(group: FoundationGroup): string {
  const count = group.systems.length;
  return `${group.label} · ${count} ${count === 1 ? "SYSTEM" : "SYSTEMS"}`;
}
