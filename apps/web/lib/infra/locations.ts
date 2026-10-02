/** Location objects live in the objects table with type `location`. No new table. */

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
