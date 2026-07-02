import type {
  CapabilityCoverageStatus,
  CapabilityMapCapability,
  CapabilityMapDomain,
} from "@minea/types";

export type CapabilityMapFilter = "all" | "has_gaps" | "unassigned" | "no_capabilities";

export interface CapabilityMapStats {
  domains: number;
  capabilities: number;
  gaps: number;
  unassigned: number;
}

export interface DomainCardCoverageCounts {
  strong: number;
  adequate: number;
  gap: number;
}

/** Per-capability coverage buckets for L1 map cards (active → strong, planned → adequate, no system → gap). */
export function domainCardCoverageCounts(
  capabilities: CapabilityMapCapability[]
): DomainCardCoverageCounts {
  const counts: DomainCardCoverageCounts = { strong: 0, adequate: 0, gap: 0 };
  for (const cap of capabilities) {
    switch (resolveCapabilityCoverage(cap)) {
      case "no_system":
        counts.gap += 1;
        break;
      case "planned":
        counts.adequate += 1;
        break;
      default:
        counts.strong += 1;
        break;
    }
  }
  return counts;
}

export function capabilityIsUnassigned(cap: CapabilityMapCapability): boolean {
  return !cap.owner?.trim();
}

export function domainHasGap(domain: CapabilityMapDomain): boolean {
  return domain.capabilities.some((cap) => resolveCapabilityCoverage(cap) === "no_system");
}

export function domainHasUnassigned(domain: CapabilityMapDomain): boolean {
  return domain.capabilities.some(capabilityIsUnassigned);
}

export function capabilityMapStats(domains: CapabilityMapDomain[]): CapabilityMapStats {
  let capabilities = 0;
  let gaps = 0;
  let unassigned = 0;
  for (const domain of domains) {
    for (const cap of domain.capabilities) {
      capabilities += 1;
      if (resolveCapabilityCoverage(cap) === "no_system") gaps += 1;
      if (capabilityIsUnassigned(cap)) unassigned += 1;
    }
  }
  return { domains: domains.length, capabilities, gaps, unassigned };
}

export function filterCapabilityMapDomains(
  domains: CapabilityMapDomain[],
  filter: CapabilityMapFilter
): { populated: CapabilityMapDomain[]; empty: CapabilityMapDomain[] } {
  const populated = domains.filter((domain) => domain.capabilities.length > 0);
  const empty = domains.filter((domain) => domain.capabilities.length === 0);

  switch (filter) {
    case "has_gaps":
      return { populated: populated.filter(domainHasGap), empty: [] };
    case "unassigned":
      return { populated: populated.filter(domainHasUnassigned), empty: [] };
    case "no_capabilities":
      return { populated: [], empty };
    default:
      return { populated, empty };
  }
}

export function resolveCapabilityCoverage(
  cap: CapabilityMapCapability
): CapabilityCoverageStatus {
  if (cap.coverage_status) return cap.coverage_status;
  if ((cap.system_count ?? 0) === 0) return "no_system";
  if (cap.object_status === "planned" || cap.object_status === "under_evaluation") {
    return "planned";
  }
  return "active";
}

export function capabilityCoverageDisplay(cap: CapabilityMapCapability): {
  dot: string;
  badge: string;
  label: string;
} {
  const kind = resolveCapabilityCoverage(cap);
  switch (kind) {
    case "no_system":
      return {
        dot: "bg-gray-400",
        badge: "bg-red-50 text-red-700 border border-red-100",
        label: "No system",
      };
    case "planned":
      return {
        dot: "bg-amber-400",
        badge: "bg-blue-50 text-blue-700 border border-blue-100",
        label: "Planned",
      };
    default:
      return {
        dot: "bg-emerald-500",
        badge: "bg-emerald-50 text-emerald-700 border border-emerald-100",
        label: "Active",
      };
  }
}
