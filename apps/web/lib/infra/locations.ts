/** Location objects live in the objects table with type `location`. No new table. */

import { impactOf, type ImpactEdge, type ImpactNode } from "@/lib/impact/relationship-impact";

export const locationTypes = [
  { key: "office", label: "Office" },
  { key: "data_center", label: "Data center" },
  { key: "colo", label: "Colo" },
  { key: "cloud_region", label: "Cloud region" },
  { key: "other", label: "Other" },
] as const;

export function locationTypeLabel(key: string): string {
  return locationTypes.find((item) => item.key === key)?.label ?? key;
}

export type LocationNote = { id: string; name: string; location: string };

/** Dry run: one location per trimmed, case-insensitive place name. Does not write. */
export function locationMigrationPlan(notes: LocationNote[]): { name: string; serverIds: string[] }[] {
  const groups = new Map<string, { name: string; serverIds: string[] }>();
  for (const note of notes) {
    const name = note.location.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { name, serverIds: [] };
    group.serverIds.push(note.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Same counts the Locations list shows: items located here, and applications impact reaches. */
export function locationPresence(
  locationId: string,
  relationships: readonly { type: string; to_object_id: string }[],
  nodes: ImpactNode[],
  edges: ImpactEdge[],
  applicationIds: ReadonlySet<string>
): { items: number; apps: number } {
  const items = relationships.filter((rel) => rel.type === "located_at" && rel.to_object_id === locationId).length;
  const apps = impactOf(nodes, edges, locationId).filter((hit) => applicationIds.has(hit.id)).length;
  return { items, apps };
}
