import { objectsApi, relationshipsApi } from "@/lib/api-client";
import type {
  FlowEndpointSide,
  IntegrationFlowProperties,
  MinEAObject,
  ObjectType,
  Relationship,
} from "@minea/types";

function relationshipKey(rel: Pick<Relationship, "type" | "from_object_id" | "to_object_id">) {
  return `${rel.type}:${rel.from_object_id}:${rel.to_object_id}`;
}

export type FlowArchitectureUpdate = {
  sources?: FlowEndpointSide;
  destinations?: FlowEndpointSide;
};

export function architectureRelationshipsFromFlow(flow: MinEAObject): Relationship[] {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const base = {
    workspace_id: flow.workspace_id,
    org_id: flow.org_id,
    created_by: null as string | null,
    created_at: flow.updated_at,
    attributes: {} as Record<string, unknown>,
  };
  const rels: Relationship[] = [];

  for (const sys of props.sources?.systems ?? []) {
    rels.push({
      ...base,
      id: `arch-src-sys-${sys.system_id}`,
      type: "connects",
      from_object_id: sys.system_id,
      from_type: "application" as ObjectType,
      to_object_id: flow.id,
      to_type: "integration_flow",
    });
  }

  for (const ent of props.sources?.entities ?? []) {
    rels.push({
      ...base,
      id: `arch-src-ent-${ent.entity_id}`,
      type: "connects",
      from_object_id: ent.entity_id,
      from_type: "data_object" as ObjectType,
      to_object_id: flow.id,
      to_type: "integration_flow",
    });
  }

  for (const sys of props.destinations?.systems ?? []) {
    rels.push({
      ...base,
      id: `arch-dst-sys-${sys.system_id}`,
      type: "connects",
      from_object_id: flow.id,
      from_type: "integration_flow",
      to_object_id: sys.system_id,
      to_type: "application" as ObjectType,
    });
  }

  for (const ent of props.destinations?.entities ?? []) {
    rels.push({
      ...base,
      id: `arch-dst-ent-${ent.entity_id}`,
      type: "connects",
      from_object_id: flow.id,
      from_type: "integration_flow",
      to_object_id: ent.entity_id,
      to_type: "data_object" as ObjectType,
    });
  }

  if (props.carrier?.carrier_id) {
    rels.push({
      ...base,
      id: `arch-carries-${props.carrier.carrier_id}`,
      type: "carries",
      from_object_id: props.carrier.carrier_id,
      from_type: "tool",
      to_object_id: flow.id,
      to_type: "integration_flow",
    });
  }

  return rels;
}

export function mergeArchitectureRelationships(
  apiRels: Relationship[],
  flow: MinEAObject
): Relationship[] {
  const keys = new Set(apiRels.map(relationshipKey));
  const merged = [...apiRels];
  for (const rel of architectureRelationshipsFromFlow(flow)) {
    if (!keys.has(relationshipKey(rel))) merged.push(rel);
  }
  return merged;
}

export async function persistFlowArchitecture(
  orgSlug: string,
  workspaceSlug: string,
  flow: MinEAObject,
  updates: FlowArchitectureUpdate,
  token: string
): Promise<MinEAObject> {
  const currentProps = (flow.properties ?? {}) as IntegrationFlowProperties;
  const sources = updates.sources ?? currentProps.sources ?? { systems: [], entities: [] };
  const destinations = updates.destinations ?? currentProps.destinations ?? { systems: [], entities: [] };
  const carrier = updates.carrier !== undefined ? updates.carrier : (currentProps.carrier ?? null);

  const properties: IntegrationFlowProperties = {
    ...currentProps,
    sources,
    destinations,
    carrier: carrier ?? undefined,
  };

  await syncFlowCarrierRelationship(orgSlug, workspaceSlug, flow.id, carrier, token);

  const updated = await objectsApi.update(
    orgSlug,
    workspaceSlug,
    flow.id,
    { properties: properties as Record<string, unknown> },
    token
  );

  return {
    ...updated,
    properties: {
      ...(updated.properties ?? {}),
      sources: properties.sources,
      destinations: properties.destinations,
    },
  };
}

export function flowRelatedNameOverrides(flow: MinEAObject): Record<string, string> {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const names: Record<string, string> = {};
  for (const s of props.sources?.systems ?? []) names[s.system_id] = s.system_name;
  for (const e of props.sources?.entities ?? []) names[e.entity_id] = e.entity_name;
  for (const s of props.destinations?.systems ?? []) names[s.system_id] = s.system_name;
  for (const e of props.destinations?.entities ?? []) names[e.entity_id] = e.entity_name;
  if (props.carrier?.carrier_id) names[props.carrier.carrier_id] = props.carrier.carrier_name;
  return names;
}

export function flowEndpointCount(side: FlowEndpointSide | undefined): number {
  return (side?.systems?.length ?? 0) + (side?.entities?.length ?? 0);
}
