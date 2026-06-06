"use client";

import type { EventProperties, MinEAObject, Relationship } from "@minea/types";
import { EventDiagramPreview } from "@/components/integration/EventDiagramPreview";
import { EntityArchitectureRelationshipsTab } from "@/components/integration/EntityArchitectureRelationshipsTab";
import { eventRelatedNameOverrides } from "@/lib/event-relationship-utils";
import { EVENT_DELIVERY_LABEL, formatProducerLabel } from "@/lib/event-utils";

interface Props {
  event: MinEAObject;
  relationships: Relationship[];
  onExpandDiagram: () => void;
}

export function EventRelationshipsTab({ event, relationships, onExpandDiagram }: Props) {
  const props = (event.properties ?? {}) as EventProperties;
  const subscribers = props.subscribers ?? [];
  const deliveryLabel = props.delivery
    ? (EVENT_DELIVERY_LABEL[props.delivery] ?? props.delivery)
    : null;

  const summary = [
    props.producer ? formatProducerLabel(props.producer) : "No producer",
    subscribers.length > 0
      ? `${subscribers.length} subscriber${subscribers.length !== 1 ? "s" : ""}`
      : null,
    props.topic,
    deliveryLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const chips = subscribers.map((s) => ({
    key: s.subscriber_id ?? s.subscriber_name,
    label: s.subscriber_name,
    className:
      s.subscriber_kind === "custom"
        ? "text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
        : undefined,
  }));

  return (
    <EntityArchitectureRelationshipsTab
      objectId={event.id}
      objectName={event.name}
      objectType="event"
      relationships={relationships}
      relatedNameOverrides={eventRelatedNameOverrides(event)}
      diagramPreview={<EventDiagramPreview event={event} onExpand={onExpandDiagram} />}
      architectureSummary={summary}
      chips={chips}
      helpText="Use the diagram header to set producer and subscribers. Use edit for broker, delivery, and other fields."
    />
  );
}
