import { ALLOWED_TRIPLES, relationshipLabelFor, type RelationshipType } from "@minea/types";
import { tripleKey } from "@/lib/allowed-triples";
import { linksForTarget } from "@/lib/relationship-targets";

export type RelDirection = "outbound" | "inverse";

export type RelOption = {
  key: string;
  type: RelationshipType;
  label: string;
  /** Stored direction this option writes: the open record is the source (outbound) or the target (inverse). */
  direction: RelDirection;
};

const ALLOWED = new Set(ALLOWED_TRIPLES.map(([type, from, to]) => tripleKey(type, from, to)));

function allowedTriple(type: string, from: string, to: string): boolean {
  return ALLOWED.has(tripleKey(type, from, to));
}

/**
 * One option per type and direction, labelled from the open record's side: "Runs on" when it is the
 * stored source, "Hosts" when it is the stored target. Either way the link is saved source → target.
 * A symmetric type reads the same both ways, so it gets one option.
 */
export function buildRelationshipOptionsForTarget(fromType: string, targetType: string): RelOption[] {
  const options: RelOption[] = [];
  const seen = new Set<string>();
  for (const link of linksForTarget(fromType, targetType)) {
    const outbound = link.direction !== "inverse" && allowedTriple(link.type, fromType, targetType);
    const inverse = link.direction !== "outbound" && allowedTriple(link.type, targetType, fromType);
    const type = link.type as RelationshipType;
    if (outbound && !seen.has(`${type}|out`)) {
      seen.add(`${type}|out`);
      options.push({ key: `${type}|out`, type, label: relationshipLabelFor(type, fromType, targetType).forward, direction: "outbound" });
    }
    const words = relationshipLabelFor(type, targetType, fromType);
    if (inverse && !seen.has(`${type}|in`) && !(words.symmetric && outbound)) {
      seen.add(`${type}|in`);
      options.push({ key: `${type}|in`, type, label: words.reverse, direction: "inverse" });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function siblingOption(options: RelOption[], option: RelOption | undefined): RelOption | undefined {
  if (!option) return undefined;
  return options.find((item) => item.type === option.type && item.direction !== option.direction);
}

