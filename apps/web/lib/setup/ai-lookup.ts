import type { AddRow } from "@/lib/setup/add-plan";
import { GENERIC_TERMS, choiceForTool, normalizeTerm, type ToolHosting, type ToolKind, type ToolRecord } from "@/lib/setup/match-tools";

/** One answer from POST /orgs/{org}/catalog/lookup. AI never supplies a cost. */
export type LookupResult =
  | { input: string; status: "suggested"; name: string; vendor: string; category: string; hosting: ToolHosting; kind: ToolKind; confidence: number }
  | { input: string; status: "unknown" };

/** Client cache per typed name (normalized), for the life of the tab. `null` = asked, unknown. */
const cache = new Map<string, LookupResult | null>();
export const LOOKUP_DEBOUNCE_MS = 700;
export const LOOKUP_MAX_NAMES = 20;

export function lookupKey(name: string): string {
  return normalizeTerm(name);
}

/** Typed names worth asking about: new, still Custom, not dismissed, not generic, not cached. */
export function namesToLookUp(rows: AddRow[], dismissed: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const key = lookupKey(row.input);
    if (row.status !== "custom" || row.existing || row.customBuilt) continue;
    if (row.kind !== "app" && row.kind !== "platform") continue;
    if (key.length < 3 || GENERIC_TERMS.has(key) || dismissed.has(key) || cache.has(key)) continue;
    if (!out.includes(row.input)) out.push(row.input);
  }
  return out.slice(0, LOOKUP_MAX_NAMES);
}

export function rememberLookups(names: string[], results: LookupResult[]): void {
  const byKey = new Map(results.map((result) => [lookupKey(result.input), result]));
  for (const name of names) {
    const hit = byKey.get(lookupKey(name));
    cache.set(lookupKey(name), hit && hit.status === "suggested" ? hit : null);
  }
}

/** A failed or timed-out lookup: don't retry these names this session; cards stay Custom. */
export function rememberFailed(names: string[]): void {
  for (const name of names) if (!cache.has(lookupKey(name))) cache.set(lookupKey(name), null);
}

export function suggestedTool(result: Extract<LookupResult, { status: "suggested" }>): ToolRecord {
  return { name: result.name, aliases: [], vendor: result.vendor, category: result.category, hosting: result.hosting, kind: result.kind, typicalAnnual: null, unit: "year", suggested: true };
}

/** Put cached suggestions on still-Custom rows. Returns the same array when nothing changes. */
export function applySuggestions(rows: AddRow[], dismissed: ReadonlySet<string>): AddRow[] {
  let changed = false;
  const next = rows.map((row) => {
    const key = lookupKey(row.input);
    if (row.status !== "custom" || row.existing || row.customBuilt || dismissed.has(key)) return row;
    const hit = cache.get(key);
    if (!hit || hit.status !== "suggested" || hit.kind !== row.kind) return row;
    changed = true;
    const tool = suggestedTool(hit);
    return { ...row, status: "matched" as const, tool, options: [tool], name: tool.name, choice: choiceForTool(tool) };
  });
  return changed ? next : rows;
}

/** "We built it ourselves" on a suggested card: back to the typed name, and never suggest it again. */
export function builtInHouse(row: AddRow): Partial<AddRow> {
  return { status: "custom", tool: null, options: [], customBuilt: true, name: row.input, choice: "unknown" };
}

export function clearLookupCache(): void {
  cache.clear();
}
