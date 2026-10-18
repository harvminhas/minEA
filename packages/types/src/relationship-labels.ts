import type { RelationshipType } from "./index";
import registry from "./relationship-labels.json";

/** Words for one stored relationship type, as read from either end. */
export type RelationshipLabel = {
  /** Read from the stored source: "Runs on". */
  forward: string;
  /** Read from the stored target: "Hosts". */
  reverse: string;
  /** "{from} runs on {to}". */
  sentence: (from: string, to: string) => string;
  /** The same link from the target's side: "{to} hosts {from}". */
  reverseSentence: (from: string, to: string) => string;
  /** Same words both ways; a reversed link is the same link. */
  symmetric: boolean;
  /** A→B and B→A may both be recorded (a mutual dependency, two data flows). */
  mutual: boolean;
};

type Words = { forward: string; reverse: string; sentence: string; reverse_sentence: string };
type Override = Words & { from: string[]; to: string[] };
type Entry = Words & { symmetric?: boolean; mutual?: boolean; overrides?: Override[] };
type AccountabilityEntry = { forward: string; reverse: string; description: string };

const TYPES = registry.types as Record<string, Entry>;

function fill(template: string, from: string, to: string): string {
  return template.split("{from}").join(from).split("{to}").join(to);
}

function build(entry: Entry, words: Words): RelationshipLabel {
  const symmetric = Boolean(entry.symmetric);
  return {
    forward: words.forward,
    reverse: symmetric ? words.forward : words.reverse,
    sentence: (from, to) => fill(words.sentence, from, to),
    reverseSentence: (from, to) => (symmetric ? fill(words.sentence, to, from) : fill(words.reverse_sentence, from, to)),
    symmetric,
    mutual: symmetric || Boolean(entry.mutual),
  };
}

/** Raw registry (packages/types/src/relationship-labels.json); the API reads its own copy. */
export const RELATIONSHIP_REGISTRY = registry;

/**
 * One label for every relationship type. Forward is the stored source → target.
 * Reverse is the same edge read from the target. Shared with the API through the JSON registry.
 */
export const RELATIONSHIP_LABELS = Object.fromEntries(
  Object.entries(TYPES).map(([type, entry]) => [type, build(entry, entry)]),
) as Record<RelationshipType, RelationshipLabel>;

/**
 * Words for a type between two record types: a per-pair override when the registry has one and
 * both ends are known
 * ("Accessed through" for an AI model → platform), otherwise the type's own words. An unknown type
 * (a newer build wrote it to the shared database) falls back to its own name instead of throwing.
 */
export function relationshipLabelFor(type: string, fromType?: string | null, toType?: string | null): RelationshipLabel {
  const entry = TYPES[type];
  if (!entry) {
    const plain = String(type ?? "").replace(/_/g, " ").trim() || "linked to";
    const words = {
      forward: plain.charAt(0).toUpperCase() + plain.slice(1),
      reverse: "Linked from",
      sentence: `{from} ${plain} {to}`,
      reverse_sentence: "{to} is linked from {from}",
    };
    return build(words, words);
  }
  // Both ends must be known: "runs on" to a platform is "Accessed through" only for an AI model.
  const override =
    fromType && toType
      ? (entry.overrides ?? []).find((item) => item.from.includes(fromType) && item.to.includes(toType))
      : undefined;
  return override ? build(entry, override) : RELATIONSHIP_LABELS[type as RelationshipType];
}

export type AccountabilityLabel = { forward: string; reverse: string; description: string };

/** People accountability verbs (team/role → item): "Owns" on the team, "Owned by" on the item. */
export const ACCOUNTABILITY_LABELS = registry.accountability as Record<string, AccountabilityEntry>;

/** The verb the owner sync wrote before "owns" (still read as ownership when the team is the owner). */
export const ACCOUNTABILITY_OWNER_LEGACY = registry.accountability_owner_legacy as Record<string, string>;

export function accountabilityLabel(kind: string): AccountabilityLabel {
  return ACCOUNTABILITY_LABELS[kind] ?? { forward: kind.replace(/_/g, " "), reverse: kind.replace(/_/g, " "), description: "" };
}
