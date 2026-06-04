import type { CapabilityCoverageStatus, CapabilityMapCapability } from "@minea/types";

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
