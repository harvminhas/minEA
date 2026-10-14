/** Owner team / named owner picks: what's already in the workspace plus what was just typed on
 * other rows. One spelling per name (case and spaces don't make a new team or person). */

export function ownerKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Existing spellings win over typed ones; existing A–Z first, then typed in the order typed. */
export function ownerPicks(existing: (string | null | undefined)[], typed: (string | null | undefined)[]): string[] {
  const out = new Map<string, string>();
  const add = (list: (string | null | undefined)[], sort: boolean) => {
    const clean = list.map((name) => (name ?? "").trim().replace(/\s+/g, " ")).filter(Boolean);
    const sorted = sort ? clean.sort((a, b) => a.localeCompare(b)) : clean;
    for (const name of sorted) if (!out.has(ownerKey(name))) out.set(ownerKey(name), name);
  };
  add(existing, true);
  add(typed, false);
  return [...out.values()];
}

/** The pick a typed name means ("sales " → "Sales"), or the trimmed typed name when it's new. */
export function canonicalOwner(typed: string, picks: string[]): string {
  const key = ownerKey(typed);
  if (!key) return "";
  return picks.find((pick) => ownerKey(pick) === key) ?? typed.trim().replace(/\s+/g, " ");
}
