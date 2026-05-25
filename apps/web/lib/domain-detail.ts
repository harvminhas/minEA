import type {
  DomainDetail,
  DomainMappingSystem,
  DomainProperties,
  MappingFitness,
  MinEAObject,
  Relationship,
} from "@minea/types";
import { capabilityMapApi, objectsApi, relationshipsApi } from "@/lib/api-client";

const VALID_FITNESS = new Set<MappingFitness>(["none", "weak", "adequate", "strong"]);

function normalizeFitness(value: unknown): MappingFitness {
  if (typeof value === "string" && VALID_FITNESS.has(value as MappingFitness) && value !== "none") {
    return value as MappingFitness;
  }
  return "adequate";
}

function buildDomainDetail(
  domainObject: MinEAObject,
  capabilities: DomainDetail["capabilities"],
  systems: DomainMappingSystem[],
  mappings: DomainDetail["mappings"]
): DomainDetail {
  const mappedCapIds = new Set(mappings.map((mapping) => mapping.capability_id));
  const fitnessCounts = { strong: 0, adequate: 0, weak: 0 };
  for (const mapping of mappings) {
    if (mapping.fitness in fitnessCounts) {
      fitnessCounts[mapping.fitness as keyof typeof fitnessCounts] += 1;
    }
  }

  const props = domainObject.properties as DomainProperties;

  return {
    id: domainObject.id,
    name: domainObject.name,
    icon: props.icon ?? null,
    owner: domainObject.owner ?? null,
    description: domainObject.description ?? null,
    source_template_id: props.source_template_id ?? null,
    capabilities,
    systems,
    mappings,
    stats: {
      capability_count: capabilities.length,
      mapped_system_count: systems.length,
      strong_count: fitnessCounts.strong,
      adequate_count: fitnessCounts.adequate,
      weak_count: fitnessCounts.weak,
      gap_count: capabilities.filter((cap) => !mappedCapIds.has(cap.id)).length,
    },
  };
}

async function buildDomainDetailFallback(
  orgSlug: string,
  workspaceSlug: string,
  domainId: string,
  token: string
): Promise<DomainDetail> {
  const [map, domainObject] = await Promise.all([
    capabilityMapApi.get(orgSlug, workspaceSlug, token),
    objectsApi.get(orgSlug, workspaceSlug, domainId, token),
  ]);

  const mapDomain = map.domains.find((domain) => domain.id === domainId);
  if (!mapDomain || domainObject.type !== "business_domain") {
    throw new Error("Domain not found");
  }

  const props = domainObject.properties as DomainProperties;
  const pinnedSystemIds = (props.mapping_system_ids ?? []).map(String);

  const relationshipGroups = await Promise.all(
    mapDomain.capabilities.map((capability) =>
      relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: capability.id }, token)
    )
  );

  const mappings: DomainDetail["mappings"] = [];
  const relSystemIds = new Set<string>();

  mapDomain.capabilities.forEach((capability, index) => {
    for (const rel of relationshipGroups[index] ?? []) {
      if (rel.type !== "supported_by" || rel.to_type !== "application") continue;
      relSystemIds.add(rel.to_object_id);
      mappings.push({
        capability_id: capability.id,
        system_id: rel.to_object_id,
        relationship_id: rel.id,
        fitness: normalizeFitness(rel.attributes?.fitness),
      });
    }
  });

  const orderedSystemIds = [...pinnedSystemIds];
  for (const systemId of [...relSystemIds].sort()) {
    if (!orderedSystemIds.includes(systemId)) orderedSystemIds.push(systemId);
  }

  const systems: DomainMappingSystem[] = [];
  if (orderedSystemIds.length > 0) {
    const applications = await objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token);
    const byId = new Map(applications.items.map((item) => [item.id, item]));
    for (const systemId of orderedSystemIds) {
      const system = byId.get(systemId);
      if (!system) continue;
      const systemProps = system.properties as { category?: string; vendor?: string; hosting_model?: string };
      systems.push({
        id: system.id,
        name: system.name,
        category: systemProps.category ?? null,
        vendor: systemProps.vendor ?? null,
        status: system.status ?? null,
        hosting_model: systemProps.hosting_model ?? null,
      });
    }
  }

  return buildDomainDetail(domainObject, mapDomain.capabilities, systems, mappings);
}

export async function fetchDomainDetail(
  orgSlug: string,
  workspaceSlug: string,
  domainId: string,
  token: string
): Promise<DomainDetail> {
  try {
    return await capabilityMapApi.getDomain(orgSlug, workspaceSlug, domainId, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("404")) throw error;
    return buildDomainDetailFallback(orgSlug, workspaceSlug, domainId, token);
  }
}

async function ensureMappingSystemColumn(
  orgSlug: string,
  workspaceSlug: string,
  domainId: string,
  systemId: string,
  token: string
) {
  const domainObject = await objectsApi.get(orgSlug, workspaceSlug, domainId, token);
  const props = domainObject.properties as DomainProperties;
  const pinned = [...(props.mapping_system_ids ?? []).map(String)];
  if (!pinned.includes(systemId)) {
    pinned.push(systemId);
    await objectsApi.update(
      orgSlug,
      workspaceSlug,
      domainId,
      { properties: { ...props, mapping_system_ids: pinned } },
      token
    );
  }
}

export async function addDomainMappingSystem(
  orgSlug: string,
  workspaceSlug: string,
  domainId: string,
  systemId: string,
  token: string
) {
  try {
    await capabilityMapApi.addMappingSystem(orgSlug, workspaceSlug, domainId, { system_id: systemId }, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("404")) throw error;
    await ensureMappingSystemColumn(orgSlug, workspaceSlug, domainId, systemId, token);
  }
}

export async function createDomainMappingSystem(
  orgSlug: string,
  workspaceSlug: string,
  domainId: string,
  name: string,
  token: string
) {
  try {
    return await capabilityMapApi.createMappingSystem(orgSlug, workspaceSlug, domainId, { name }, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("404")) throw error;

    const created = await objectsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "application",
        name,
        status: "active",
        properties: {},
      },
      token
    );
    await ensureMappingSystemColumn(orgSlug, workspaceSlug, domainId, created.id, token);
    return fetchDomainDetail(orgSlug, workspaceSlug, domainId, token);
  }
}

export async function upsertDomainMapping(
  orgSlug: string,
  workspaceSlug: string,
  domainId: string,
  capabilityId: string,
  systemId: string,
  fitness: MappingFitness,
  token: string
) {
  try {
    await capabilityMapApi.upsertMapping(
      orgSlug,
      workspaceSlug,
      domainId,
      { capability_id: capabilityId, system_id: systemId, fitness },
      token
    );
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("404")) throw error;
  }

  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: capabilityId },
    token
  );
  const match = existing.find(
    (rel: Relationship) =>
      rel.type === "supported_by" && rel.to_object_id === systemId && rel.to_type === "application"
  );

  if (fitness === "none") {
    if (match) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, match.id, token);
    }
    return;
  }

  await ensureMappingSystemColumn(orgSlug, workspaceSlug, domainId, systemId, token);

  if (match) {
    await relationshipsApi.delete(orgSlug, workspaceSlug, match.id, token);
  }

  await relationshipsApi.create(
    orgSlug,
    workspaceSlug,
    {
      type: "supported_by",
      from_object_id: capabilityId,
      from_type: "capability",
      to_object_id: systemId,
      to_type: "application",
      attributes: { fitness },
    },
    token
  );
}
