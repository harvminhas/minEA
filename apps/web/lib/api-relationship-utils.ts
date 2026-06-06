import { objectsApi, relationshipsApi } from "@/lib/api-client";
import type {
  ApiConsumerRef,
  ApiGatewayRef,
  ApiProperties,
  ApiProviderRef,
  MinEAObject,
  Relationship,
} from "@minea/types";

function relationshipKey(rel: Pick<Relationship, "type" | "from_object_id" | "to_object_id">) {
  return `${rel.type}:${rel.from_object_id}:${rel.to_object_id}`;
}

function isApiArchitectureRel(rel: Relationship): boolean {
  return (
    rel.to_type === "api" &&
    (rel.type === "exposes" || rel.type === "consumes" || rel.type === "hosts")
  );
}

export async function syncApiRelationships(
  orgSlug: string,
  workspaceSlug: string,
  apiId: string,
  provider: ApiProviderRef | null,
  consumers: ApiConsumerRef[],
  gateway: ApiGatewayRef | null,
  token: string
): Promise<void> {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: apiId },
    token
  );
  const archRels = existing.filter(isApiArchitectureRel);

  const existingExposes = archRels.find((r) => r.type === "exposes");
  const desiredExposesKey = provider
    ? relationshipKey({
        type: "exposes",
        from_object_id: provider.provider_id,
        to_object_id: apiId,
      })
    : null;
  const existingExposesKey = existingExposes
    ? relationshipKey(existingExposes)
    : null;

  if (desiredExposesKey !== existingExposesKey) {
    if (existingExposes) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, existingExposes.id, token);
    }
    if (provider) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "exposes",
          from_object_id: provider.provider_id,
          from_type: provider.provider_kind,
          to_object_id: apiId,
          to_type: "api",
        },
        token
      );
    }
  }

  const desiredConsumeKeys = new Set(
    consumers
      .filter((c) => c.consumer_kind === "application" && c.consumer_id)
      .map((c) =>
        relationshipKey({
          type: "consumes",
          from_object_id: c.consumer_id!,
          to_object_id: apiId,
        })
      )
  );

  const existingConsumeKeys = new Set(
    archRels.filter((r) => r.type === "consumes").map((r) => relationshipKey(r))
  );

  for (const rel of archRels.filter((r) => r.type === "consumes")) {
    const key = relationshipKey(rel);
    if (!desiredConsumeKeys.has(key)) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
      existingConsumeKeys.delete(key);
    }
  }

  for (const consumer of consumers) {
    if (consumer.consumer_kind !== "application" || !consumer.consumer_id) continue;
    const key = relationshipKey({
      type: "consumes",
      from_object_id: consumer.consumer_id,
      to_object_id: apiId,
    });
    if (!existingConsumeKeys.has(key)) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "consumes",
          from_object_id: consumer.consumer_id,
          from_type: "application",
          to_object_id: apiId,
          to_type: "api",
        },
        token
      );
      existingConsumeKeys.add(key);
    }
  }

  const existingHosts = archRels.find((r) => r.type === "hosts");
  const desiredHostsKey = gateway?.gateway_id
    ? relationshipKey({
        type: "hosts",
        from_object_id: gateway.gateway_id,
        to_object_id: apiId,
      })
    : null;
  const existingHostsKey = existingHosts ? relationshipKey(existingHosts) : null;

  if (desiredHostsKey !== existingHostsKey) {
    if (existingHosts) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, existingHosts.id, token);
    }
    if (gateway?.gateway_id) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "hosts",
          from_object_id: gateway.gateway_id,
          from_type: "tool",
          to_object_id: apiId,
          to_type: "api",
        },
        token
      );
    }
  }
}

export type ApiArchitectureUpdate = {
  provider?: ApiProviderRef | null;
  consumers?: ApiConsumerRef[];
  gateway?: ApiGatewayRef | null;
};

export function architectureRelationshipsFromApi(api: MinEAObject): Relationship[] {
  const props = (api.properties ?? {}) as ApiProperties;
  const base = {
    workspace_id: api.workspace_id,
    org_id: api.org_id,
    created_by: null as string | null,
    created_at: api.updated_at,
    attributes: {} as Record<string, unknown>,
  };
  const rels: Relationship[] = [];

  if (props.provider) {
    rels.push({
      ...base,
      id: `arch-exposes-${props.provider.provider_id}`,
      type: "exposes",
      from_object_id: props.provider.provider_id,
      from_type: props.provider.provider_kind,
      to_object_id: api.id,
      to_type: "api",
    });
  }

  for (const consumer of props.consumers ?? []) {
    if (consumer.consumer_kind === "application" && consumer.consumer_id) {
      rels.push({
        ...base,
        id: `arch-consumes-${consumer.consumer_id}`,
        type: "consumes",
        from_object_id: consumer.consumer_id,
        from_type: "application",
        to_object_id: api.id,
        to_type: "api",
      });
    }
  }

  if (props.gateway?.gateway_id) {
    rels.push({
      ...base,
      id: `arch-hosts-${props.gateway.gateway_id}`,
      type: "hosts",
      from_object_id: props.gateway.gateway_id,
      from_type: "tool",
      to_object_id: api.id,
      to_type: "api",
    });
  }

  return rels;
}

export function mergeArchitectureRelationships(
  apiRels: Relationship[],
  api: MinEAObject
): Relationship[] {
  const apiKeys = new Set(apiRels.map(relationshipKey));
  const merged = [...apiRels];
  for (const rel of architectureRelationshipsFromApi(api)) {
    if (!apiKeys.has(relationshipKey(rel))) merged.push(rel);
  }
  return merged;
}

export async function persistApiArchitecture(
  orgSlug: string,
  workspaceSlug: string,
  api: MinEAObject,
  updates: ApiArchitectureUpdate,
  token: string
): Promise<MinEAObject> {
  const currentProps = (api.properties ?? {}) as ApiProperties;
  const provider = updates.provider !== undefined ? updates.provider : (currentProps.provider ?? null);
  const consumers = updates.consumers ?? currentProps.consumers ?? [];
  const gateway = updates.gateway !== undefined ? updates.gateway : (currentProps.gateway ?? null);

  const properties: ApiProperties = {
    ...currentProps,
    provider: provider ?? undefined,
    consumers,
    gateway: gateway ?? undefined,
  };

  await syncApiRelationships(orgSlug, workspaceSlug, api.id, provider, consumers, gateway, token);

  const updated = await objectsApi.update(
    orgSlug,
    workspaceSlug,
    api.id,
    { properties: properties as Record<string, unknown> },
    token
  );

  return {
    ...updated,
    properties: {
      ...(updated.properties ?? {}),
      provider: properties.provider,
      consumers: properties.consumers,
      gateway: properties.gateway,
    },
  };
}

export function apiRelatedNameOverrides(api: MinEAObject): Record<string, string> {
  const props = (api.properties ?? {}) as ApiProperties;
  const names: Record<string, string> = {};
  if (props.provider) names[props.provider.provider_id] = props.provider.provider_name;
  for (const c of props.consumers ?? []) {
    if (c.consumer_id) names[c.consumer_id] = c.consumer_name;
  }
  if (props.gateway?.gateway_id) names[props.gateway.gateway_id] = props.gateway.gateway_name;
  return names;
}
