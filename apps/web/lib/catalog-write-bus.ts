import type { MinEAObject, Relationship } from "@minea/types";

/**
 * Every object/relationship write goes through api-client, which reports it here. The workspace
 * catalog (Model screen, app Relationships tab) listens, so a write from any panel (API, event,
 * flow, integration infra, data) lands in the cached catalog without each caller remembering to.
 */
export type CatalogWrite = {
  orgSlug: string;
  workspaceSlug: string;
  object?: MinEAObject;
  removeId?: string;
  relationship?: Relationship;
  removeRelationshipId?: string;
  /** Ask the server for a fresh catalog shortly after (writes we can't mirror exactly). */
  refetch?: boolean;
};

/** Objects that link apps to each other; their writes always schedule a catalog refetch too. */
export const CONNECTOR_TYPES: ReadonlySet<string> = new Set([
  "api",
  "event",
  "integration_flow",
  "tool",
  "message_broker",
  "data_object",
  "data_store",
  "data_domain",
]);

export function isConnectorType(type: string | null | undefined): boolean {
  return !!type && CONNECTOR_TYPES.has(type);
}

type Listener = (write: CatalogWrite) => void;
const listeners = new Set<Listener>();
const writtenAt = new Map<string, number>();
const RECENT_MS = 2 * 60 * 1000;

export function onCatalogWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markWrittenHere(relationshipId: string, now: number = Date.now()): void {
  writtenAt.set(relationshipId, now);
}

export function emitCatalogWrite(write: CatalogWrite): void {
  if (write.relationship?.id) markWrittenHere(write.relationship.id);
  for (const listener of listeners) {
    try {
      listener(write);
    } catch {
      // A cache update must never fail the save that triggered it.
    }
  }
}

/** A link this tab created moments ago, which a catalog fetch that started earlier may not have yet. */
export function writtenHereRecently(id: string, now: number = Date.now()): boolean {
  const at = writtenAt.get(id);
  if (at == null) return false;
  if (now - at > RECENT_MS) {
    writtenAt.delete(id);
    return false;
  }
  return true;
}

/** Report a write once it succeeds, and pass the result through. */
export function reportWrite<T>(promise: Promise<T>, toWrite: (result: T) => CatalogWrite | null): Promise<T> {
  return promise.then((result) => {
    const write = toWrite(result);
    if (write) emitCatalogWrite(write);
    return result;
  });
}
