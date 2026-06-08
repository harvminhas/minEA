import type {
  CapabilityMapCapability,
  DomainDetail,
  MappingFitness,
  MinEAObject,
  RoadmapItemProperties,
} from "@minea/types";
import { resolveCapabilityCoverage } from "@/lib/capability-map-card-utils";

export type CapabilityFitnessBucket = "strong" | "adequate" | "weak" | "gap";

const FITNESS_RANK: Record<MappingFitness, number> = {
  strong: 3,
  adequate: 2,
  weak: 1,
  none: 0,
};

export function capabilityFitnessBucket(
  domain: DomainDetail,
  capability: CapabilityMapCapability
): CapabilityFitnessBucket {
  if (resolveCapabilityCoverage(capability) === "no_system") {
    return "gap";
  }
  const mappings = domain.mappings.filter((m) => m.capability_id === capability.id);
  if (mappings.length === 0) {
    return "gap";
  }
  let best: MappingFitness = "weak";
  let rank = 0;
  for (const mapping of mappings) {
    const fitness = mapping.fitness === "none" ? "weak" : mapping.fitness;
    const r = FITNESS_RANK[fitness] ?? 0;
    if (r > rank) {
      rank = r;
      best = fitness;
    }
  }
  if (best === "strong") return "strong";
  if (best === "adequate") return "adequate";
  return "weak";
}

export function capabilityFitnessCounts(domain: DomainDetail) {
  const counts = { strong: 0, adequate: 0, weak: 0, gap: 0 };
  for (const cap of domain.capabilities) {
    counts[capabilityFitnessBucket(domain, cap)] += 1;
  }
  return counts;
}

const ACTIVE_ROADMAP_STATUSES = new Set([
  "discovery",
  "planned",
  "in_progress",
  "blocked",
  "deferred",
]);

export function roadmapsForDomain(
  roadmapItems: MinEAObject[],
  linkedProductIds: Set<string>
): MinEAObject[] {
  return roadmapItems.filter((item) => {
    const props = (item.properties ?? {}) as RoadmapItemProperties;
    const status = props.roadmap_status ?? "discovery";
    if (!ACTIVE_ROADMAP_STATUSES.has(status)) return false;
    const productId = props.product?.product_id;
    return productId ? linkedProductIds.has(productId) : false;
  });
}

export interface DomainGapItem {
  id: string;
  severity: "error" | "warning";
  message: string;
  fixLabel: string;
  onFix?: () => void;
}
