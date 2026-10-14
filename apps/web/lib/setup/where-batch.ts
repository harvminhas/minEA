import type { HostingChoice } from "@/lib/setup/match-tools";

/**
 * Setup step 3 "Where each one lives" as ONE /objects/batch call (one transaction, one snapshot /
 * catalogue dirty mark), instead of a create / link / PUT per row in sequence. Same writes as before:
 * new servers (existing ones reused by name), a location + located_at per new server with a "where",
 * runs_on per app→server pick, and each app's hosting_model (overwritten, as the old PUT did).
 */
export type WhereServer = { key: string; name: string; where?: string };
export type WhereLink = { appKey: string; serverKey: string };
export type WhereApp = { key: string; objectId?: string; choice: HostingChoice };
type Create = { key: string; type: string; name: string; properties: Record<string, unknown> };
type Update = { id: string; properties: Record<string, unknown>; overwrite: true };
type Rel = { type: string; from_key?: string; to_key?: string; from_id?: string; to_id?: string; from_type: string; to_type: string };
export type WhereBatch = { creates: Create[]; updates: Update[]; relationships: Rel[] };

export const hostingFor = (choice: HostingChoice): string =>
  choice === "saas" ? "saas" : choice === "own" ? "on_premise" : choice === "desktop" ? "desktop" : "";

const serverRef = (key: string) => `server:${key}`;

export function whereBatch(
  servers: WhereServer[],
  links: WhereLink[],
  apps: WhereApp[],
  /** Server key → id for servers already in the workspace (reused, never duplicated). */
  existingIds: Record<string, string>,
  /** Current hosting_model per app object id: an unchanged value is not re-sent. */
  currentHosting: Record<string, unknown> = {},
): WhereBatch {
  const creates: Create[] = [];
  const relationships: Rel[] = [];
  const planned = new Set<string>();
  const ref = (key: string) => (existingIds[key] ? { id: existingIds[key]! } : planned.has(key) ? { key: serverRef(key) } : null);
  for (const server of servers) {
    if (existingIds[server.key] || planned.has(server.key)) continue;
    planned.add(server.key);
    creates.push({ key: serverRef(server.key), type: "model", name: server.name, properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" } });
  }
  const located = new Set<string>();
  for (const server of servers) {
    if (!server.where || located.has(server.key) || existingIds[server.key] || !planned.has(server.key)) continue;
    const place = `location:${server.key}`;
    creates.push({ key: place, type: "location", name: server.where, properties: { location_type: "other" } });
    relationships.push({ type: "located_at", from_key: serverRef(server.key), from_type: "model", to_key: place, to_type: "location" });
    located.add(server.key);
  }
  for (const link of links) {
    const app = apps.find((item) => item.key === link.appKey);
    const server = ref(link.serverKey);
    if (!app?.objectId || !server) continue;
    relationships.push({
      type: "runs_on",
      from_id: app.objectId,
      from_type: "application",
      ...("id" in server ? { to_id: server.id } : { to_key: server.key }),
      to_type: "model",
    });
  }
  const updates: Update[] = [];
  for (const app of apps) {
    const hosting_model = hostingFor(app.choice);
    if (!app.objectId || !hosting_model || currentHosting[app.objectId] === hosting_model) continue;
    updates.push({ id: app.objectId, properties: { hosting_model }, overwrite: true });
  }
  return { creates, updates, relationships };
}

/** Server key → id after the batch: existing ids plus the ids the batch created, in create order. */
export function serverIdsAfter(batch: WhereBatch, existingIds: Record<string, string>, createdIds: string[]): Record<string, string> {
  const ids = { ...existingIds };
  batch.creates.forEach((create, index) => {
    if (create.key.startsWith("server:") && createdIds[index]) ids[create.key.slice("server:".length)] = createdIds[index]!;
  });
  return ids;
}

/** The old step-3 save: one request per write, in sequence. Kept for the before/after count. */
export function sequentialRequestCount(batch: WhereBatch, apps: WhereApp[]): number {
  const oldUpdates = apps.filter((app) => app.objectId && hostingFor(app.choice)).length;
  return batch.creates.length + batch.relationships.length + oldUpdates;
}
