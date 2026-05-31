import type {
  CapabilityMap,
  MappingFitness,
  MinEAObject,
  Product,
  Relationship,
} from "@minea/types";

export type CapabilityFitnessDisplay = "good" | "fair" | "poor" | "none";

export interface PortfolioCapabilityProduct {
  id: string;
  name: string;
  lifecycle: string;
}

export interface PortfolioCapabilityRow {
  id: string;
  name: string;
  description?: string | null;
  fitness: CapabilityFitnessDisplay;
  products: PortfolioCapabilityProduct[];
  hasOverlap: boolean;
  statusLabel: string;
  systemCount: number;
  hasGap: boolean;
}

export interface PortfolioCapabilityDomainGroup {
  id: string;
  name: string;
  icon?: string | null;
  rows: PortfolioCapabilityRow[];
}

export interface PortfolioCapabilityMapSummary {
  totalCapabilities: number;
  realisedCount: number;
  unrealisedCount: number;
  overlapCount: number;
  overlapNames: string[];
  poorFitnessCount: number;
}

export interface PortfolioCapabilityMapData {
  domains: PortfolioCapabilityDomainGroup[];
  summary: PortfolioCapabilityMapSummary;
}

const VALID_FITNESS = new Set<MappingFitness>(["none", "weak", "adequate", "strong"]);

function normalizeFitness(value: unknown): MappingFitness {
  if (typeof value === "string" && VALID_FITNESS.has(value as MappingFitness) && value !== "none") {
    return value as MappingFitness;
  }
  return "adequate";
}

export function aggregateCapabilityFitness(fitnesses: MappingFitness[]): CapabilityFitnessDisplay {
  if (fitnesses.length === 0) return "none";
  if (fitnesses.some((f) => f === "weak")) return "poor";
  if (fitnesses.every((f) => f === "strong")) return "good";
  if (fitnesses.some((f) => f === "strong" || f === "adequate")) return "fair";
  return "poor";
}

function capabilityStatusLabel(
  status: string | null | undefined,
  fitness: CapabilityFitnessDisplay,
  hasProducts: boolean
): string {
  if (fitness === "poor" && hasProducts) return "At risk";
  if (status === "planned") return "Planned";
  if (status === "retiring") return "Retiring";
  if (status === "retired") return "Retired";
  if (status === "under_evaluation") return "Identified";
  if (hasProducts) return "Active";
  return "Identified";
}

export function buildPortfolioCapabilityMap(
  map: CapabilityMap,
  products: Product[],
  capabilityObjects: MinEAObject[],
  supportedByRels: Relationship[]
): PortfolioCapabilityMapData {
  const capById = new Map(capabilityObjects.map((c) => [c.id, c]));

  const fitnessByCap = new Map<string, MappingFitness[]>();
  const systemsByCap = new Map<string, Set<string>>();

  for (const rel of supportedByRels) {
    if (rel.type !== "supported_by") continue;
    const capId = rel.from_object_id;
    const fitness = normalizeFitness(rel.attributes?.fitness);
    if (!fitnessByCap.has(capId)) fitnessByCap.set(capId, []);
    fitnessByCap.get(capId)!.push(fitness);
    if (!systemsByCap.has(capId)) systemsByCap.set(capId, new Set());
    systemsByCap.get(capId)!.add(rel.to_object_id);
  }

  const productsByCap = new Map<string, PortfolioCapabilityProduct[]>();
  for (const product of products) {
    for (const capId of product.capability_ids) {
      if (!productsByCap.has(capId)) productsByCap.set(capId, []);
      productsByCap.get(capId)!.push({
        id: product.id,
        name: product.name,
        lifecycle: product.lifecycle,
      });
    }
  }

  const allRows: PortfolioCapabilityRow[] = [];
  const domains: PortfolioCapabilityDomainGroup[] = map.domains.map((domain) => {
    const rows: PortfolioCapabilityRow[] = domain.capabilities.map((cap) => {
      const capObj = capById.get(cap.id);
      const fitnesses = fitnessByCap.get(cap.id) ?? [];
      const fitness = aggregateCapabilityFitness(fitnesses);
      const capProducts = productsByCap.get(cap.id) ?? [];
      const row: PortfolioCapabilityRow = {
        id: cap.id,
        name: cap.name,
        description: capObj?.description ?? null,
        fitness,
        products: capProducts,
        hasOverlap: capProducts.length > 1,
        statusLabel: capabilityStatusLabel(capObj?.status, fitness, capProducts.length > 0),
        systemCount: systemsByCap.get(cap.id)?.size ?? 0,
        hasGap: capProducts.length === 0,
      };
      allRows.push(row);
      return row;
    });
    return { id: domain.id, name: domain.name, icon: domain.icon, rows };
  });

  const realisedCount = allRows.filter((r) => r.products.length > 0).length;
  const overlapRows = allRows.filter((r) => r.hasOverlap);

  return {
    domains,
    summary: {
      totalCapabilities: allRows.length,
      realisedCount,
      unrealisedCount: allRows.length - realisedCount,
      overlapCount: overlapRows.length,
      overlapNames: overlapRows.map((r) => r.name),
      poorFitnessCount: allRows.filter((r) => r.fitness === "poor").length,
    },
  };
}
