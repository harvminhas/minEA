/**
 * Follow-ups that refer back ("Which of those has no owner?"). When the previous turn named items,
 * a question the browser answers itself is worked out over just those items; vendor rows count as
 * their apps. Anything else goes to the model, which gets the turns as context anyway.
 */
import type { ThreadTurn } from "@/lib/ask/thread";

// "it" only in lower case, so "IT estate" doesn't count.
const BACK_WORDS = /\b(those|these|them|they|that one|this one|the same ones|of those|of these|of them)\b/i;
const IT_WORD = /\bit\b/;

export function refersBack(question: string): boolean {
  return BACK_WORDS.test(question) || IT_WORD.test(question);
}

export type FollowUpScope = { ids: Set<string>; note: string };

/** The scope for a question, or null when it doesn't refer back or the last turn named nothing. */
export function followUpScope(question: string, previous: ThreadTurn | undefined): FollowUpScope | null {
  if (!previous || !refersBack(question)) return null;
  const ids = new Set(previous.items.map((item) => item.id));
  if (!ids.size) return null;
  const what = previous.scopeLabel ?? `${ids.size} ${ids.size === 1 ? "item" : "items"}`;
  return { ids, note: `Looking at the ${what} from your last question` };
}
