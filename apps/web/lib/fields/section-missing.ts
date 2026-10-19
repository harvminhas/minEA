import type { CatalogMissing } from "@/lib/model-catalog";
import type { FieldDef, Section } from "@/lib/fields/registry";

/**
 * The fields behind each gap the header's "N missing" badge counts (CatalogMissing).
 * Section hints are derived from the same flags, so they always add up to the badge.
 */
export const MISSING_FIELD_KEYS: Record<keyof CatalogMissing, readonly string[]> = {
  owner: ["owner"],
  vendor: ["vendor"],
  cost: ["cost"],
  renewal: ["contract_renewal", "commitment_ends"],
  lifecycle: ["status", "lifecycle"],
  criticality: ["criticality"],
};

export function missingKeys(missing: CatalogMissing): (keyof CatalogMissing)[] {
  return (Object.keys(MISSING_FIELD_KEYS) as (keyof CatalogMissing)[]).filter((key) => missing[key]);
}

/** The header badge: how many of the tracked gaps are open. */
export function countMissing(missing: CatalogMissing): number {
  return missingKeys(missing).length;
}

/**
 * Split the badge count across the sections a panel shows. A gap goes to the section of
 * its field; if that field isn't shown (omitted or hidden), to its section in the full
 * registry when that section is shown, else to the first shown section, so nothing drops.
 */
export function missingBySection(
  missing: CatalogMissing,
  shown: readonly { section: Section; fields: readonly Pick<FieldDef, "key">[] }[],
  all: readonly Pick<FieldDef, "key" | "section">[] = []
): Partial<Record<Section, number>> {
  const counts: Partial<Record<Section, number>> = {};
  if (shown.length === 0) return counts;
  for (const gap of missingKeys(missing)) {
    const keys = MISSING_FIELD_KEYS[gap];
    const home =
      shown.find((group) => group.fields.some((def) => keys.includes(def.key)))?.section ??
      shown.find((group) => all.some((def) => keys.includes(def.key) && def.section === group.section))?.section ??
      shown[0].section;
    counts[home] = (counts[home] ?? 0) + 1;
  }
  return counts;
}
