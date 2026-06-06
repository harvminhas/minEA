import type {
  EventBrokerRef,
  EventProducerRef,
  EventProperties,
  EventSubscriberRef,
  MinEAObject,
  ObjectStatus,
} from "@minea/types";

export const INTEGRATION_LAYER_COLOR = "#14b8a6";

export const EVENT_DELIVERY = [
  { value: "at_least_once", label: "At-least-once" },
  { value: "at_most_once", label: "At-most-once" },
  { value: "exactly_once", label: "Exactly-once" },
];

export const EVENT_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "retiring", label: "Retiring" },
  { value: "retired", label: "Retired" },
];

export const EVENT_AUDIENCES = [
  { value: "internal", label: "Internal" },
  { value: "partner", label: "Partner" },
  { value: "public", label: "Public" },
];

export const EVENT_CRITICALITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const PRESET_SUBSCRIBERS = [
  "Analytics pipeline",
  "Partner webhooks",
  "Fulfillment",
];

export const EVENT_BROKER_TRANSPORTS = [
  { value: "kafka", label: "Kafka" },
  { value: "eventbridge", label: "EventBridge" },
  { value: "pub_sub", label: "Pub/Sub" },
  { value: "rabbitmq", label: "RabbitMQ" },
  { value: "solace", label: "Solace" },
] as const;

export const EVENT_BROKER_TRANSPORT_LABEL = Object.fromEntries(
  EVENT_BROKER_TRANSPORTS.map((t) => [t.value, t.label])
);

export function brokerKeyFromRef(broker: EventBrokerRef | null | undefined): string {
  if (!broker) return "";
  if (broker.broker_id) return `registered:${broker.broker_id}`;
  if (broker.transport) return `preset:${broker.transport}`;
  return "";
}

/** Ensure integration infra brokers default to tool kind for relationship sync. */
export function normalizeEventBrokerRef(broker: EventBrokerRef | null | undefined): EventBrokerRef | null {
  if (!broker) return null;
  if (!broker.broker_id) return broker;
  return {
    ...broker,
    broker_kind: broker.broker_kind ?? "tool",
  };
}

export function brokerRefFromKey(
  key: string,
  registeredBrokers: Array<{
    id: string;
    name: string;
    transport?: string;
    object_type?: "tool" | "message_broker";
  }>
): EventBrokerRef | null {
  if (!key) return null;
  if (key === "__register__") return null;
  if (key.startsWith("preset:")) {
    const transport = key.slice(7) as EventBrokerRef["transport"];
    const label = EVENT_BROKER_TRANSPORT_LABEL[transport ?? ""] ?? transport;
    return { broker_name: label ?? key, transport };
  }
  if (key.startsWith("registered:")) {
    const id = key.slice(11);
    const broker = registeredBrokers.find((b) => b.id === id);
    if (!broker) return null;
    return normalizeEventBrokerRef({
      broker_id: broker.id,
      broker_name: broker.name,
      broker_kind: broker.object_type ?? "tool",
      transport: broker.transport as EventBrokerRef["transport"],
    });
  }
  return null;
}

export const EVENT_DELIVERY_LABEL = Object.fromEntries(EVENT_DELIVERY.map((d) => [d.value, d.label]));

export const EVENT_CRITICALITY_LABEL = Object.fromEntries(
  EVENT_CRITICALITY.map((c) => [c.value, c.label])
);

export function formatEventSubtitle(topic?: string, delivery?: string): string {
  if (topic) return `Event · ${topic}`;
  if (delivery) {
    const label = EVENT_DELIVERY_LABEL[delivery] ?? delivery;
    return `Event · ${label}`;
  }
  return "Event";
}

export function formatSubscribersLine(subscribers: EventSubscriberRef[]): string {
  const count = subscribers.length;
  if (count === 0) return "0";
  return `${count} · ${subscribers[0]!.subscriber_name}`;
}

export function formatProducerLabel(producer: EventProducerRef): string {
  if (producer.producer_kind === "component" && producer.system_name) {
    return `${producer.producer_name} (${producer.system_name})`;
  }
  return producer.producer_name;
}

export function buildEventDraft(params: {
  name: string;
  topic: string;
  version: string;
  schemaRef: string;
  delivery: string;
  producer: EventProducerRef | null;
  subscribers: EventSubscriberRef[];
  broker: EventBrokerRef | null;
  audience: string;
  criticality: string;
  status: ObjectStatus;
  owner?: string;
  tags?: string[];
  nodeLayout?: Record<string, { x: number; y: number }>;
}): MinEAObject {
  const properties: EventProperties = {
    topic: params.topic.trim() || undefined,
    version: params.version.trim() || undefined,
    schema_ref: params.schemaRef.trim() || undefined,
    delivery: params.delivery as EventProperties["delivery"],
    producer: params.producer,
    subscribers: params.subscribers,
    broker: params.broker,
    audience: params.audience as EventProperties["audience"],
    criticality: params.criticality as EventProperties["criticality"],
    node_layout: params.nodeLayout,
  };

  return {
    id: "draft",
    workspace_id: "",
    org_id: "",
    type: "event",
    name: params.name.trim() || "New event",
    description: undefined,
    owner: params.owner,
    status: params.status,
    tags: params.tags ?? [],
    properties: properties as Record<string, unknown>,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
