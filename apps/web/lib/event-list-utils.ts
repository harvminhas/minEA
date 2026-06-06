import { EVENT_CRITICALITY_LABEL, EVENT_DELIVERY_LABEL } from "@/lib/event-utils";
import type { EventProperties, MinEAObject } from "@minea/types";

export type EventSortKey =
  | "name"
  | "topic"
  | "producer"
  | "subscribers"
  | "delivery"
  | "criticality"
  | "owner"
  | "status"
  | "updated";

export function eventProps(object: MinEAObject): EventProperties {
  return (object.properties ?? {}) as EventProperties;
}

export function eventTopic(object: MinEAObject): string {
  return eventProps(object).topic?.trim() ?? "";
}

export function eventProducerName(object: MinEAObject): string {
  return eventProps(object).producer?.producer_name?.trim() ?? "";
}

export function eventSubscriberCount(object: MinEAObject): number {
  return eventProps(object).subscribers?.length ?? 0;
}

export function eventDeliveryLabel(object: MinEAObject): string {
  const d = eventProps(object).delivery;
  return d ? (EVENT_DELIVERY_LABEL[d] ?? d) : "";
}

export function eventCriticalityLabel(object: MinEAObject): string {
  const c = eventProps(object).criticality ?? "";
  return c ? (EVENT_CRITICALITY_LABEL[c] ?? c) : "";
}

export function filterEvents(
  items: MinEAObject[],
  opts: { search: string; delivery: string; status: string; owner: string }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const topic = eventTopic(item).toLowerCase();
      const producer = eventProducerName(item).toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !topic.includes(q) && !producer.includes(q)) {
        return false;
      }
    }
    if (opts.delivery !== "all" && (eventProps(item).delivery ?? "") !== opts.delivery) return false;
    if (opts.status !== "all" && (item.status ?? "planned") !== opts.status) return false;
    if (opts.owner !== "all") {
      const owner = item.owner?.trim() ?? "";
      if (owner !== opts.owner) return false;
    }
    return true;
  });
}

export function sortEvents(
  items: MinEAObject[],
  key: EventSortKey,
  dir: "asc" | "desc"
): MinEAObject[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "topic":
        cmp = eventTopic(a).localeCompare(eventTopic(b));
        break;
      case "producer":
        cmp = eventProducerName(a).localeCompare(eventProducerName(b));
        break;
      case "subscribers":
        cmp = eventSubscriberCount(a) - eventSubscriberCount(b);
        break;
      case "delivery":
        cmp = eventDeliveryLabel(a).localeCompare(eventDeliveryLabel(b));
        break;
      case "criticality":
        cmp = eventCriticalityLabel(a).localeCompare(eventCriticalityLabel(b));
        break;
      case "owner":
        cmp = (a.owner?.trim() ?? "").localeCompare(b.owner?.trim() ?? "");
        break;
      case "status":
        cmp = (a.status ?? "planned").localeCompare(b.status ?? "planned");
        break;
      case "updated":
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        break;
    }
    if (cmp === 0) return a.name.localeCompare(b.name);
    return mult * cmp;
  });
}

export function eventFilterOptions(items: MinEAObject[]) {
  const deliveries = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const d = eventProps(item).delivery;
    if (d) deliveries.add(d);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    deliveries: [...deliveries].sort((a, b) =>
      (EVENT_DELIVERY_LABEL[a] ?? a).localeCompare(EVENT_DELIVERY_LABEL[b] ?? b)
    ),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}
