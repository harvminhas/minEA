import type {
  ApiProperties,
  EventProperties,
  IntegrationFlowProperties,
  MinEAObject,
  ObjectType,
  Relationship,
  RelationshipType,
} from "@minea/types";

function relationshipKey(rel: Pick<Relationship, "type" | "from_object_id" | "to_object_id">) {
  return `${rel.type}:${rel.from_object_id}:${rel.to_object_id}`;
}

/** Property-based links from APIs, events, and flows that reference this infra tool. */
export function architectureRelationshipsReferencingInfra(
  infra: MinEAObject,
  apis: MinEAObject[],
  events: MinEAObject[],
  flows: MinEAObject[]
): Relationship[] {
  const base = {
    workspace_id: infra.workspace_id,
    org_id: infra.org_id,
    created_by: null as string | null,
    created_at: infra.updated_at,
    attributes: {} as Record<string, unknown>,
  };
  const rels: Relationship[] = [];

  for (const api of apis) {
    const gateway = ((api.properties ?? {}) as ApiProperties).gateway;
    if (gateway?.gateway_id === infra.id) {
      rels.push({
        ...base,
        id: `arch-hosts-${api.id}`,
        type: "hosts",
        from_object_id: infra.id,
        from_type: "tool",
        to_object_id: api.id,
        to_type: "api",
      });
    }
  }

  for (const event of events) {
    const broker = ((event.properties ?? {}) as EventProperties).broker;
    if (broker?.broker_id === infra.id) {
      rels.push({
        ...base,
        id: `arch-routes-${event.id}`,
        type: "routes",
        from_object_id: infra.id,
        from_type: "tool",
        to_object_id: event.id,
        to_type: "event",
      });
    }
  }

  for (const flow of flows) {
    const carrier = ((flow.properties ?? {}) as IntegrationFlowProperties).carrier;
    if (carrier?.carrier_id === infra.id) {
      rels.push({
        ...base,
        id: `arch-carries-${flow.id}`,
        type: "carries",
        from_object_id: infra.id,
        from_type: "tool",
        to_object_id: flow.id,
        to_type: "integration_flow",
      });
    }
  }

  return rels;
}

export type InfraDiagramLink = {
  objectId: string;
  name: string;
  objectType: ObjectType;
  relationshipType: RelationshipType;
  direction: "outbound" | "inbound";
};

export function extractInfraDiagramLinks(
  infraId: string,
  relationships: Relationship[],
  nameById: Record<string, string>
): InfraDiagramLink[] {
  const links: InfraDiagramLink[] = [];

  for (const rel of relationships) {
    if (rel.from_object_id === infraId) {
      links.push({
        objectId: rel.to_object_id,
        name: nameById[rel.to_object_id] ?? "Unknown",
        objectType: rel.to_type,
        relationshipType: rel.type,
        direction: "outbound",
      });
      continue;
    }
    if (rel.to_object_id === infraId) {
      links.push({
        objectId: rel.from_object_id,
        name: nameById[rel.from_object_id] ?? "Unknown",
        objectType: rel.from_type,
        relationshipType: rel.type,
        direction: "inbound",
      });
    }
  }

  return links;
}

export function infraDiagramNameById(
  infra: MinEAObject,
  apis: MinEAObject[],
  events: MinEAObject[],
  flows: MinEAObject[]
): Record<string, string> {
  const names: Record<string, string> = { [infra.id]: infra.name };
  for (const api of apis) {
    names[api.id] = api.name;
    const gateway = ((api.properties ?? {}) as ApiProperties).gateway;
    if (gateway?.gateway_id) names[gateway.gateway_id] = gateway.gateway_name;
  }
  for (const event of events) names[event.id] = event.name;
  for (const flow of flows) names[flow.id] = flow.name;
  return names;
}

export function mergeInfraArchitectureRelationships(
  dbRels: Relationship[],
  infra: MinEAObject,
  apis: MinEAObject[],
  events: MinEAObject[],
  flows: MinEAObject[]
): Relationship[] {
  const keys = new Set(dbRels.map(relationshipKey));
  const merged = [...dbRels];
  for (const rel of architectureRelationshipsReferencingInfra(infra, apis, events, flows)) {
    if (!keys.has(relationshipKey(rel))) merged.push(rel);
  }
  return merged;
}
