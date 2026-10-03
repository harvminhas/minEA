import { ADD_KNOWN_SHARE, QUESTION_WORDS } from "@/lib/setup/setupMin";
import { normalizeTerm } from "@/lib/setup/match-tools";

export type AddDecision = "add" | "question" | "ambiguous";

const LEADING = /^\s*(\+|add\b|new\b)/i;

/** Drop a leading add / new / + so the matcher sees the names. */
export function addListText(text: string): string {
  return text.replace(LEADING, "").trim();
}

/** Commas, new lines, semicolons, "and", and "&". */
export function splitAddList(text: string): string[] {
  const normalized = text.replace(/\s+and\s+/gi, ",").replace(/\s*&\s*/g, ",");
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of normalized.split(/[\n,;]+/)) {
    const trimmed = part.trim();
    const key = normalizeTerm(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(trimmed);
  }
  return items;
}

function startsWithQuestion(text: string): boolean {
  const first = text.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, "") ?? "";
  return (QUESTION_WORDS as readonly string[]).includes(first);
}

/**
 * Checked before the question strategies. `known` is true for a catalog name,
 * a catalog alias, or an existing item name.
 */
export function classifyAddIntent(text: string, known: (term: string) => boolean): AddDecision {
  const trimmed = text.trim();
  if (!trimmed) return "question";
  if (LEADING.test(trimmed)) return "add";
  if (trimmed.endsWith("?") || startsWithQuestion(trimmed)) return "question";
  const items = splitAddList(trimmed);
  if (items.length >= 2) {
    const hits = items.filter((item) => known(item)).length;
    if (hits > 0 && hits / items.length >= ADD_KNOWN_SHARE) return "add";
    if (hits > 0) return "ambiguous";
  }
  return "question";
}
