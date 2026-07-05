import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { normalizeEventBrokerRef } from "@/lib/event-utils";
import type {
  EventBrokerRef,
  EventProducerRef,
  EventProperties,
  EventSubscriberRef,
  MinEAObject,
  Relationship,
} from "@minea/types";

function relationshipKey(rel: Pick<Relationship, "type" | "from_object_id" | "to_object_id">) {
  return `${rel.type}:${rel.from_object_id}:${rel.to_object_id}`;
}

function isEventArchitectureRel(rel: Relationship): boolean {
  return (
    rel.to_type === "event" &&
    (rel.type === "publishes" || rel.type === "subscribes" || rel.type === "routes")
  );
}

export async function syncEventRelationships(
  orgSlug: string,
  workspaceSlug: string,
  eventId: string,
  producer: EventProducerRef | null,
  subscribers: EventSubscriberRef[],
  broker: EventBrokerRef | null,
  token: string
): Promise<void> {
  const normalizedBroker = normalizeEventBrokerRef(broker);
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: eventId },
    token
  );
  const archRels = existing.filter(isEventArchitectureRel);

  const existingPublishes = archRels.find((r) => r.type === "publishes");
  const desiredPublishesKey = producer
    ? relationshipKey({
        type: "publishes",
        from_object_id: producer.producer_id,
        to_object_id: eventId,
      })
    : null;
  const existingPublishesKey = existingPublishes
    ? relationshipKey(existingPublishes)
    : null;

  if (desiredPublishesKey !== existingPublishesKey) {
    if (existingPublishes) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, existingPublishes.id, token);
    }
    if (producer) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "publishes",
          from_object_id: producer.producer_id,
          from_type: producer.producer_kind,
          to_object_id: eventId,
          to_type: "event",
        },
        token
      );
    }
  }

  const desiredSubscribeKeys = new Set(
    subscribers
      .filter((s) => s.subscriber_id && s.subscriber_kind !== "custom")
      .map((s) =>
        relationshipKey({
          type: "subscribes",
          from_object_id: s.subscriber_id!,
          to_object_id: eventId,
        })
      )
  );

  const existingSubscribeKeys = new Set(
    archRels.filter((r) => r.type === "subscribes").map((r) => relationshipKey(r))
  );

  for (const rel of archRels.filter((r) => r.type === "subscribes")) {
    const key = relationshipKey(rel);
    if (!desiredSubscribeKeys.has(key)) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
      existingSubscribeKeys.delete(key);
    }
  }

  for (const sub of subscribers) {
    if (!sub.subscriber_id || sub.subscriber_kind === "custom") continue;
    const key = relationshipKey({
      type: "subscribes",
      from_object_id: sub.subscriber_id,
      to_object_id: eventId,
    });
    if (!existingSubscribeKeys.has(key)) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "subscribes",
          from_object_id: sub.subscriber_id,
          from_type: sub.subscriber_kind === "component" ? "component" : "application",
          to_object_id: eventId,
          to_type: "event",
        },
        token
      );
      existingSubscribeKeys.add(key);
    }
  }

  const existingRoutes = archRels.find((r) => r.type === "routes");
  const desiredRoutesKey = broker?.broker_id
    ? relationshipKey({
        type: "routes",
        from_object_id: broker.broker_id,
        to_object_id: eventId,
      })
    : null;
  const existingRoutesKey = existingRoutes ? relationshipKey(existingRoutes) : null;

  if (desiredRoutesKey !== existingRoutesKey) {
    if (existingRoutes) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, existingRoutes.id, token);
    }
    if (normalizedBroker?.broker_id) {
      const brokerFromType =
        normalizedBroker.broker_kind === "message_broker" ? "message_broker" : "tool";
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "routes",
          from_object_id: normalizedBroker.broker_id,
          from_type: brokerFromType,
          to_object_id: eventId,
          to_type: "event",
        },
        token
      );
    }
  }
}

export type EventArchitectureUpdate = {
  producer?: EventProducerRef | null;
  subscribers?: EventSubscriberRef[];
  broker?: EventBrokerRef | null;
};

export function architectureRelationshipsFromEvent(event: MinEAObject): Relationship[] {
  const props = (event.properties ?? {}) as EventProperties;
  const base = {
    workspace_id: event.workspace_id,
    org_id: event.org_id,
    created_by: null as string | null,
    created_at: event.updated_at,
    attributes: {} as Record<string, unknown>,
  };
  const rels: Relationship[] = [];

  if (props.producer) {
    rels.push({
      ...base,
      id: `arch-publishes-${props.producer.producer_id}`,
      type: "publishes",
      from_object_id: props.producer.producer_id,
      from_type: props.producer.producer_kind,
      to_object_id: event.id,
      to_type: "event",
    });
  }

  for (const sub of props.subscribers ?? []) {
    if (sub.subscriber_id) {
      rels.push({
        ...base,
        id: `arch-subscribes-${sub.subscriber_id}`,
        type: "subscribes",
        from_object_id: sub.subscriber_id,
        from_type: sub.subscriber_kind === "component" ? "component" : "application",
        to_object_id: event.id,
        to_type: "event",
      });
    }
  }

  const broker = normalizeEventBrokerRef(props.broker ?? null);
  if (broker?.broker_id) {
    rels.push({
      ...base,
      id: `arch-routes-${broker.broker_id}`,
      type: "routes",
      from_object_id: broker.broker_id,
      from_type: broker.broker_kind === "message_broker" ? "message_broker" : "tool",
      to_object_id: event.id,
      to_type: "event",
    });
  }

  return rels;
}

export function mergeArchitectureRelationships(
  apiRels: Relationship[],
  event: MinEAObject
): Relationship[] {
  const keys = new Set(apiRels.map(relationshipKey));
  const merged = [...apiRels];
  for (const rel of architectureRelationshipsFromEvent(event)) {
    if (!keys.has(relationshipKey(rel))) merged.push(rel);
  }
  return merged;
}

export async function persistEventArchitecture(
  orgSlug: string,
  workspaceSlug: string,
  event: MinEAObject,
  updates: EventArchitectureUpdate,
  token: string
): Promise<MinEAObject> {
  const currentProps = (event.properties ?? {}) as EventProperties;
  const producer = updates.producer !== undefined ? updates.producer : (currentProps.producer ?? null);
  const subscribers = updates.subscribers ?? currentProps.subscribers ?? [];
  const broker = normalizeEventBrokerRef(
    updates.broker !== undefined ? updates.broker : (currentProps.broker ?? null)
  );

  const properties: Record<string, unknown> = {
    ...currentProps,
    producer: producer ?? undefined,
    subscribers,
  };
  if (broker) {
    properties.broker = broker;
  } else {
    properties.broker = null;
  }

  await syncEventRelationships(
    orgSlug,
    workspaceSlug,
    event.id,
    producer,
    subscribers,
    broker,
    token
  );

  const updated = await objectsApi.update(
    orgSlug,
    workspaceSlug,
    event.id,
    { properties: properties as Record<string, unknown> },
    token
  );

  return {
    ...updated,
    properties: {
      ...(updated.properties ?? {}),
      producer: properties.producer as EventProperties["producer"],
      subscribers: properties.subscribers as EventProperties["subscribers"],
      broker: broker ?? undefined,
    },
  };
}

export function eventRelatedNameOverrides(event: MinEAObject): Record<string, string> {
  const props = (event.properties ?? {}) as EventProperties;
  const names: Record<string, string> = {};
  if (props.producer) names[props.producer.producer_id] = props.producer.producer_name;
  for (const s of props.subscribers ?? []) {
    if (s.subscriber_id) names[s.subscriber_id] = s.subscriber_name;
  }
  if (props.broker?.broker_id) names[props.broker.broker_id] = props.broker.broker_name;
  return names;
}
