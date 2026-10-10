/**
 * The conversation on the answer page (Ask v2 step 4). Lives in this browser tab only
 * (sessionStorage): never sent to the server for storage, gone when the tab closes.
 * Each turn keeps what a follow-up needs as context: the question, a one-line summary, item ids.
 */
import type { AskAnswer } from "@/lib/ask/deterministic";
import { splitSummary } from "@/lib/ask/rich";
import { sameQuestion } from "@/lib/ask/route";

export type ThreadItem = { id: string; name: string };
/** scopeLabel: what the items were, for a follow-up's note ("6 vendors"). Vendor rows store their apps. */
export type ThreadTurn = { question: string; summary: string; items: ThreadItem[]; at: number; scopeLabel?: string };
export type Thread = { turns: ThreadTurn[] };
export type AskContextTurn = { question: string; summary: string; item_ids: string[] };

export const MAX_TURNS = 20;
export const CONTEXT_TURNS = 4;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const threadKey = (orgSlug: string, workspaceSlug: string) => `bubomap.ask.thread.v1.${orgSlug}/${workspaceSlug}`;

export function readThread(storage: StorageLike | undefined, orgSlug: string, workspaceSlug: string): Thread {
  try {
    const raw = storage?.getItem(threadKey(orgSlug, workspaceSlug));
    const parsed = raw ? (JSON.parse(raw) as Thread) : null;
    return parsed && Array.isArray(parsed.turns) ? { turns: parsed.turns.slice(-MAX_TURNS) } : { turns: [] };
  } catch {
    return { turns: [] };
  }
}

export function writeThread(storage: StorageLike | undefined, orgSlug: string, workspaceSlug: string, thread: Thread): void {
  try {
    storage?.setItem(threadKey(orgSlug, workspaceSlug), JSON.stringify(thread));
  } catch {
    /* storage full or blocked: the thread just isn't kept */
  }
}

export function clearThread(storage: StorageLike | undefined, orgSlug: string, workspaceSlug: string): Thread {
  try {
    storage?.removeItem(threadKey(orgSlug, workspaceSlug));
  } catch {
    /* ignore */
  }
  return { turns: [] };
}

/**
 * Add the answer for a question. A question already in the thread (asked again, or reached with
 * back/forward) updates its own turn in place, so history navigation never grows the thread.
 */
export function addTurn(thread: Thread, turn: ThreadTurn): Thread {
  const index = thread.turns.findIndex((existing) => sameQuestion(existing.question, turn.question));
  if (index >= 0) {
    const existing = thread.turns[index];
    if (existing.summary === turn.summary && JSON.stringify(existing.items) === JSON.stringify(turn.items)) return thread;
    const turns = [...thread.turns];
    turns[index] = { ...turn, at: existing.at };
    return { turns };
  }
  return { turns: [...thread.turns, turn].slice(-MAX_TURNS) };
}

/** Turns shown above the current question: everything before its latest occurrence (back/forward safe). */
export function earlierTurns(thread: Thread, question: string): ThreadTurn[] {
  for (let index = thread.turns.length - 1; index >= 0; index -= 1) {
    if (sameQuestion(thread.turns[index].question, question)) return thread.turns.slice(0, index);
  }
  return thread.turns;
}

/** What a follow-up sends: the last 4 earlier turns (the server re-checks every id). */
export function contextFor(thread: Thread, question: string): AskContextTurn[] {
  return earlierTurns(thread, question)
    .slice(-CONTEXT_TURNS)
    .map((turn) => ({ question: turn.question, summary: turn.summary, item_ids: turn.items.map((item) => item.id) }));
}

const plain = (text: string) => text.replace(/\s?\[\d+\]/g, "").replace(/\*\*/g, "").trim();

export function turnFromAnswer(question: string, answer: AskAnswer, now = Date.now()): ThreadTurn {
  const items: ThreadItem[] = [];
  const add = (id: string | null | undefined, name: string) => {
    if (id && !items.some((item) => item.id === id)) items.push({ id, name });
  };
  for (const row of answer.table?.rows ?? []) {
    if (row.items?.length) for (const item of row.items) add(item.id, item.name);
    else add(row.recordId, row.label);
  }
  for (const citation of answer.citations) add(citation.recordId, citation.displayName || citation.row.name);
  const rowCount = answer.table?.rows.length ?? 0;
  const scopeLabel = answer.table?.kind === "vendors" && rowCount ? `${rowCount} ${rowCount === 1 ? "vendor" : "vendors"}` : undefined;
  return {
    question,
    summary: plain(answer.summary || splitSummary(answer.answerText).summary).slice(0, 600),
    items: items.slice(0, 40),
    at: now,
    ...(scopeLabel ? { scopeLabel } : {}),
  };
}
