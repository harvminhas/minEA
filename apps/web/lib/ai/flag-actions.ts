import type { FlagId, LandscapeFlag } from "@/lib/ai/landscape";

/** Where a flag's fix happens: a record, opened at a field or on its Relationships tab. */
export type FlagDestination = {
  /** Record to open. */
  recordId: string;
  /** Details field to open for editing (registry key). */
  focus?: string;
  /** Open the Relationships tab instead, highlighting links of this type. */
  highlight?: string;
};

/** Model-section of a record type, or undefined when it has no record page. */
export type SectionOf = (id: string) => string | undefined;

/** A flagged item id is an object id (agent) or `${hostId}:${feature key}` (an app's AI feature). */
export function recordIdOf(itemId: string): string {
  const colon = itemId.indexOf(":");
  return colon > 0 ? itemId.slice(0, colon) : itemId;
}

const isFeature = (itemId: string) => itemId.includes(":");

/**
 * One builder per flag type. Exhaustive over FlagId, so a new flag type fails to compile (and the
 * test below fails) until it says where its fix lives.
 */
export const FLAG_ACTIONS: Record<FlagId, (flag: LandscapeFlag, itemId: string) => FlagDestination> = {
  // Can see customer/financial data: a feature's toggles live on its app; an agent's reads on its links.
  F1: (_flag, itemId) =>
    isFeature(itemId) ? { recordId: recordIdOf(itemId), focus: "ai_features" } : { recordId: itemId, highlight: "reads" },
  // Vendor may train: the feature's terms are on the app's AI features; an agent's are on its model.
  F2: (flag, itemId) =>
    isFeature(itemId) ? { recordId: recordIdOf(itemId), focus: "ai_features" } : { recordId: flag.fixOn ?? itemId, focus: flag.fixOn ? "vendor_trains" : "uses_model" },
  F3: (_flag, itemId) => ({ recordId: recordIdOf(itemId), focus: "owner" }),
  F4: (_flag, itemId) => ({ recordId: recordIdOf(itemId), highlight: "writes" }),
  F5: (_flag, itemId) => ({ recordId: recordIdOf(itemId), focus: "acts_as" }),
  // Same job: open each one at its job so they can be compared and one retired.
  F6: (_flag, itemId) => (isFeature(itemId) ? { recordId: recordIdOf(itemId), focus: "ai_features" } : { recordId: itemId, focus: "job" }),
};

export function flagDestination(flag: LandscapeFlag, itemId = flag.itemIds[0] ?? ""): FlagDestination {
  return FLAG_ACTIONS[flag.id](flag, itemId);
}

/** Record URL with the deep-link params the record panel reads (?focus= / ?tab=relationships&highlight=). */
export function destinationHref(recordPath: string, dest: FlagDestination): string {
  const params = new URLSearchParams();
  if (dest.highlight) {
    params.set("tab", "relationships");
    params.set("highlight", dest.highlight);
  } else if (dest.focus) params.set("focus", dest.focus);
  const query = params.toString();
  return query ? `${recordPath}?${query}` : recordPath;
}

/** Shared flag code labels for chips and risk-flag rows (one source: the landscape titles). */
export { FLAG_LABELS } from "@/lib/ai/landscape";

/** Chips in F1..F6 order (numeric, so F10 would sort after F9). */
export function sortFlagsByCode<T extends { id: string }>(flags: readonly T[]): T[] {
  const num = (id: string) => Number(id.replace(/\D/g, "")) || 0;
  return [...flags].sort((a, b) => num(a.id) - num(b.id));
}

/** DOM id of a Risk flags row, so a chip in the tables can scroll to it. */
export function flagRowId(flag: { id: string; itemIds: readonly string[] }): string {
  return `flag-${flag.id}-${flag.itemIds.join("_")}`.replace(/[^A-Za-z0-9_-]/g, "-");
}
