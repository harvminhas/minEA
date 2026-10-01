/**
 * Ask answer strategy. This file is the only place intents, thresholds, and
 * the model instructions live. The /ai/ask loop reads the generated JSON.
 */

export const criticalityThresholds = {
  /** Depth-1 dependents with severity "direct". Three or more infer high. */
  highMinDirectDependents: 3,
} as const;

export type CriticalityLevel = "high" | "medium" | "low" | "unknown";

export type AskIntent =
  | "importance"
  | "impact"
  | "cost"
  | "ownership"
  | "gaps"
  | "renewals"
  | "lifecycle"
  | "criticality"
  | "spend"
  | "vendors"
  | "aging"
  | "unknown";

export type InferenceInput = {
  relationshipCount: number;
  /** Severity direct and not reached through another item. */
  directDependents: number;
  dependentCount: number;
  supportsCapability: boolean;
  dependentIsHigh: boolean;
};

const LEVEL_RANK: Record<Exclude<CriticalityLevel, "unknown">, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const STORED_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  tier1: 4,
};

const STORED_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
  tier1: "Critical",
};

const GAP_TRIGGER =
  /without|missing|lack|blank|unset|\bno\b|not (set|named|assigned|recorded)|does not have|doesn't have|do not have|don't have|has no|have no/;

const STOP = new Set([
  "what", "how", "does", "the", "if", "and", "for", "our", "who", "can", "we", "live", "without",
  "important", "importance", "critical", "criticality", "breaks", "break", "down", "goes", "going",
  "cost", "costs", "owns", "owner", "has", "have", "with", "from", "this", "that", "are", "any",
  "all", "not", "set", "missing", "list", "show", "which", "where", "when", "your", "you", "its",
  "item", "items", "application", "applications", "system", "systems", "model", "much", "pay",
  "paid", "vendor", "vendors", "renew", "renews", "next", "days", "year",
]);

export const strategyPrompt = `Answer the intent of the question, not only the literal field.

Intents:
- importance (how important, why is it important, how critical, can we live without): stated criticality, impact_of counts by severity, capabilities it supports, seats when a per-user cost line has them, and annual cost.
- impact (what breaks if it is down): impact_of.
- cost (what does this item cost): the cost total and the cost lines for that item.
- ownership (who owns this item): the owner column. If it is blank, owners of related items, labelled inferred.
- gaps, lists, and spend: find_gaps or aggregate. A missing-field question is not a vendor list.
- aging (out of support, unsupported OS, old servers, what needs replacing): list of infrastructure past support. End-of-life questions stay on the lifecycle list. The counts come from the infrastructure status module when that split is on.

Answer rules:
- Lead with a one-line verdict.
- If the stated field is set, use that value and back it with evidence. inferred is false.
- If the field is blank, give a verdict from the evidence, prefixed "Likely", and set inferred to true. Never present an inference as stored data.
- Criticality when the field is blank:
  - high when direct dependents (severity direct, depth 1) are >= ${criticalityThresholds.highMinDirectDependents}, OR the item supports a capability, OR a dependent is itself high or critical
  - medium when something depends on it and the high bar is not met, including 3 or more dependents that are only indirect
  - low when nothing depends on it and it supports no capability
  - unknown when it has no relationships at all. Say so. Do not guess a level.
- If stored criticality is lower than the evidence, keep the stored value and add "Dependencies suggest it may be higher." Do not add a fix action.
- 2 to 4 evidence items when you have evidence. Each citation_ids entry must be a record id that also appears in citations. No fact or number without a citation.
- Gaps: missing fields. Zero calls edges: no integrations are recorded, so this may be understated. No relationships: no relationships are recorded.
- fix_actions only when the verdict is inferred. field is "criticality" or "owner". suggested_value is the inferred value, such as "high". record_id must be one of the citations. Do not claim the value was saved.

When you are finished requesting lookups, return ONLY a JSON object:
{
  "answer_markdown": "one-line verdict",
  "intent": "importance",
  "verdict": {"text": "Likely high", "inferred": true, "basis": ["4 direct dependents"]},
  "evidence": [{"text": "short fact", "citation_ids": ["id from a lookup"]}],
  "fix_actions": [{"record_id": "id from a citation", "field": "criticality", "suggested_value": "high"}],
  "citations": [{"n": 1, "record_id": "id from a lookup", "relationship": "short phrase"}],
  "gaps": [{"record_id": "id", "field": "criticality", "message": "short sentence"}],
  "follow_ups": ["question", "question", "question"],
  "unsupported": false
}
Every evidence citation id must appear in citations. An inferred verdict must have evidence. A fix action record_id must appear in citations.
Every [n] must have a citation, and every citation id must be an id a lookup returned.
Every number in the answer must appear in a lookup result.
`;

export function answerStrategyArtifact(): { thresholds: typeof criticalityThresholds; strategyPrompt: string } {
  return { thresholds: criticalityThresholds, strategyPrompt };
}

export function classifyIntent(question: string): AskIntent {
  const q = question.toLowerCase();
  if (GAP_TRIGGER.test(q)) {
    if (/vendor/.test(q)) return "gaps";
    if (/owner/.test(q)) return "gaps";
    if (/\bcost\b|\bspend\b|\bprice\b/.test(q)) return "gaps";
    if (/renew|contract/.test(q)) return "gaps";
    if (/critical/.test(q)) return "gaps";
    if (/lifecycle|end of life|\beol\b/.test(q)) return "gaps";
  }
  if (/how important|why .{0,80} important|how critical|why .{0,80} critical|can we live without|business critical/.test(q)) return "importance";
  if (/break|fail|goes down|is down|outage|depend|impact/.test(q)) return "impact";
  if (/who owns/.test(q)) return "ownership";
  if (/no owner|unowned|without an owner/.test(q)) return "ownership";
  if (/renew|contract|expire|90 day/.test(q)) return "renewals";
  if (/out of support|unsupported|aging|old servers|needs replacing/.test(q)) return "aging";
  if (/end of life|retiring|eol/.test(q)) return "lifecycle";
  if (/critical|most important|tier 1|tier1/.test(q)) return "criticality";
  if (/what does .+ cost|how much (?:does|do|is)|what do we pay/.test(q)) return "cost";
  if (/money|spend|\bcost\b|\bpay\b/.test(q)) return "spend";
  if (/vendor/.test(q)) return "vendors";
  return "unknown";
}

export function inferCriticality(input: InferenceInput): { level: CriticalityLevel; basis: string[] } {
  if (input.relationshipCount === 0) {
    return { level: "unknown", basis: ["no relationships recorded"] };
  }
  const high: string[] = [];
  if (input.directDependents >= criticalityThresholds.highMinDirectDependents) {
    high.push(`${input.directDependents} direct dependents`);
  }
  if (input.supportsCapability) high.push("supports a capability");
  if (input.dependentIsHigh) high.push("a dependent is high");
  if (high.length) return { level: "high", basis: high };
  if (input.dependentCount > 0) {
    const indirectOnly = input.directDependents === 0;
    return {
      level: "medium",
      basis: [
        indirectOnly
          ? `${input.dependentCount} indirect dependents`
          : `${input.dependentCount} ${input.dependentCount === 1 ? "dependent" : "dependents"}`,
      ],
    };
  }
  return { level: "low", basis: ["no dependents and no capability links"] };
}

export function importanceVerdict(
  stored: string,
  inferred: { level: CriticalityLevel; basis: string[] }
): { text: string; inferred: boolean; basis: string[]; note: string | null; suggestedValue: string | null } {
  const storedRank = STORED_RANK[stored] ?? 0;
  if (storedRank > 0) {
    const inferredRank = inferred.level === "unknown" ? 0 : LEVEL_RANK[inferred.level];
    return {
      text: `${STORED_LABEL[stored] ?? stored} (set in your model)`,
      inferred: false,
      basis: inferred.basis,
      note: inferredRank > storedRank ? "Dependencies suggest it may be higher." : null,
      suggestedValue: null,
    };
  }
  if (inferred.level === "unknown") {
    return { text: "Unknown", inferred: false, basis: inferred.basis, note: null, suggestedValue: null };
  }
  return {
    text: `Likely ${inferred.level}`,
    inferred: true,
    basis: inferred.basis,
    note: null,
    suggestedValue: inferred.level,
  };
}

export type Resolvable = {
  id: string;
  name: string;
  vendor: string;
  typeLabel?: string;
  ownerTeam?: string;
  ownerPerson?: string;
};

export function resolveSubject<T extends Resolvable>(
  question: string,
  items: T[]
): { status: "none" | "one" | "many"; matches: T[] } {
  const folded = norm(question);
  const words = tokens(question);
  const scored = items
    .map((item) => ({ item, score: scoreItem(folded, words, item) }))
    .filter((entry) => entry.score > 0);
  if (!scored.length) return { status: "none", matches: [] };
  const best = Math.max(...scored.map((entry) => entry.score));
  const matches = disambiguate(question, scored.filter((entry) => entry.score === best).map((entry) => entry.item));
  return { status: matches.length === 1 ? "one" : "many", matches };
}

/** Label that tells same-named items apart: type, then owner, then vendor. */
export function choiceLabel(item: Resolvable, matches: Resolvable[]): string {
  const hint = uniqueHint(item, matches);
  if (hint) return `${item.name} (${hint})`;
  const sameName = matches.filter((peer) => norm(peer.name) === norm(item.name));
  if (sameName.length < 2) return item.name;
  const owner = [item.ownerTeam, item.ownerPerson].filter(Boolean).join(" · ");
  const extra = [item.typeLabel, owner || "no owner"].filter(Boolean).join(", ");
  return extra ? `${item.name} (${extra})` : item.name;
}

function disambiguate<T extends Resolvable>(question: string, matches: T[]): T[] {
  if (matches.length < 2) return matches;
  const folded = question.toLowerCase();
  const picked = matches.filter((item) => {
    const hint = uniqueHint(item, matches);
    return Boolean(hint && folded.includes(hint.toLowerCase()));
  });
  return picked.length === 1 ? picked : matches;
}

function uniqueHint(item: Resolvable, matches: Resolvable[]): string | null {
  const candidates = [item.typeLabel?.trim(), ownerOf(item), item.vendor?.trim()];
  for (const text of candidates) {
    if (!text || text.length < 2) continue;
    const sharers = matches.filter((peer) => hintValues(peer).some((value) => value.toLowerCase() === text.toLowerCase()));
    if (sharers.length === 1) return text;
  }
  return null;
}

function hintValues(item: Resolvable): string[] {
  return [item.typeLabel?.trim(), ownerOf(item), item.vendor?.trim()].filter((value): value is string => Boolean(value));
}

function ownerOf(item: Resolvable): string {
  return [item.ownerTeam, item.ownerPerson].filter(Boolean).join(" · ").trim();
}

function scoreItem(folded: string, words: string[], item: Resolvable): number {
  const name = norm(item.name);
  const vendor = norm(item.vendor);
  let score = 0;
  if (name.length >= 3 && folded.includes(name)) score = Math.max(score, 1000 + name.length);
  const nameWords = item.name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const word of nameWords) {
    if (word.length >= 3 && words.includes(word)) score = Math.max(score, 100 + word.length);
  }
  for (const word of words) {
    if (name.includes(word)) score = Math.max(score, 100 + word.length);
    if (vendor.length >= 3 && (vendor === word || vendor.includes(word) || word.includes(vendor))) {
      score = Math.max(score, 40 + Math.min(word.length, vendor.length));
    }
  }
  return score;
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length >= 3 && !STOP.has(word));
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
