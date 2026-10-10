/** Ask step 4: conversation thread, plus the step-3b leftovers (cold-cache stale guard, probe, row cells). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { askQueryFn, askQueryKey, type AskRemoteResult } from "./remote.ts";
import { latestOnly } from "./reveal.ts";
import { addTurn, clearThread, contextFor, earlierTurns, readThread, turnFromAnswer, writeThread, type Thread } from "./thread.ts";
import { EARLY_PROBE_SCRIPT } from "../dev/duplicate-key-probe.ts";

const Q1 = "Which vendors do we spend the most with?";
const Q2 = "Where is our money going?";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("(c) cold cache: a slow stream for Q1 then Q2 — Q1 is aborted and only Q2 can render", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let q1Aborted = false;
  let q1Finished = false;
  const run = async (question: string, signal: AbortSignal) => {
    if (question === Q1) {
      signal.addEventListener("abort", () => { q1Aborted = true; });
      await sleep(150); // the slow stream keeps going even if nobody listens (worst case)
      q1Finished = true;
      return { answer_text: "FIRST" } as never;
    }
    await sleep(20);
    return { answer_text: "SECOND" } as never;
  };
  const options = (question: string) => ({ queryKey: askQueryKey("o", "w", question), queryFn: askQueryFn(question, run), retry: false as const });
  let current = Q1;
  const observer = new QueryObserver<AskRemoteResult>(client, options(Q1));
  const seen: string[] = [];
  const unsubscribe = observer.subscribe((result) => {
    const shown = latestOnly(result.data, current)?.payload.answer_text;
    if (shown) seen.push(shown);
  });
  await sleep(30); // Q1 is in flight, nothing cached
  current = Q2;
  observer.setOptions(options(Q2));
  await sleep(250); // long enough for Q1 to finish late
  assert.equal(q1Aborted, true, "the old stream was aborted");
  assert.equal(q1Finished, true);
  assert.equal(latestOnly(observer.getCurrentResult().data, current)?.payload.answer_text, "SECOND");
  assert.deepEqual([...new Set(seen)], ["SECOND"], "FIRST never rendered");
  unsubscribe();
  client.clear();
});

const memory = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
};
const turn = (question: string, ids: string[] = []) => ({ question, summary: `${question} answered.`, items: ids.map((id) => ({ id, name: id })), at: 1 });

test("thread: kept in this tab's storage, same question updates its turn, New conversation clears", () => {
  const storage = memory();
  let thread: Thread = { turns: [] };
  thread = addTurn(thread, turn(Q1, ["1"]));
  thread = addTurn(thread, turn("which of those renew?"));
  thread = addTurn(thread, { ...turn("Which of those renew"), summary: "updated" });
  assert.equal(thread.turns.length, 2);
  assert.equal(thread.turns[1].summary, "updated");
  writeThread(storage, "o", "w", thread);
  assert.deepEqual(readThread(storage, "o", "w"), thread);
  assert.deepEqual(readThread(storage, "o", "other"), { turns: [] });
  assert.deepEqual(clearThread(storage, "o", "w"), { turns: [] });
  assert.deepEqual(readThread(storage, "o", "w"), { turns: [] });
});

test("thread: earlier turns follow the question on screen (back/forward), context is the last 4 with ids", () => {
  let thread: Thread = { turns: [] };
  for (const q of ["A?", "B?", "C?", "D?", "E?", "F?"]) thread = addTurn(thread, turn(q, [q[0]]));
  assert.deepEqual(earlierTurns(thread, "C?").map((t) => t.question), ["A?", "B?"]); // back to C
  assert.deepEqual(earlierTurns(thread, "new question").length, 6);
  const context = contextFor(thread, "G?");
  assert.deepEqual(context.map((t) => t.question), ["C?", "D?", "E?", "F?"]);
  assert.deepEqual(context[0], { question: "C?", summary: "C? answered.", item_ids: ["C"] });
});

test("thread: a turn keeps a plain summary and the answer's item ids (table rows and citations)", () => {
  const answer = {
    handler: "vendors", answerText: "**You use 6 vendors** [1]. Salesforce is largest.", citations: [{ n: 1, recordId: "9", relationship: "", row: { name: "Zoom" } }],
    gaps: [], followUps: [], caption: { generatedAt: "", recordCount: 0, gapCount: 0 },
    table: { kind: "vendors", columns: ["", "", ""], rows: [{ label: "Salesforce", value: "", detail: "", recordId: "1" }, { label: "Microsoft", value: "", detail: "", recordId: "3" }] },
  } as never;
  const t = turnFromAnswer(Q1, answer, 5);
  assert.equal(t.summary, "You use 6 vendors.");
  assert.deepEqual(t.items.map((i) => i.id), ["1", "3", "9"]);
});

test("AskScreen: thread above the answer, New conversation, context sent with the question", () => {
  const src = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /<ConversationThread turns=\{earlier\}/);
  assert.match(src, /New conversation/);
  assert.match(src, /const context = contextFor\(threadRef\.current, asked\)/);
  assert.match(src, /queryFn: askQueryFn\(question,/);
  const client = readFileSync(new URL("../api-client.ts", import.meta.url), "utf8");
  assert.match(client, /JSON\.stringify\(context\.length \? \{ question, context \} : \{ question \}\)/);
});

test("(a) vendor rows: the apps cell has its own app links, the rest of the row opens the vendor", () => {
  const rich = readFileSync(new URL("../../components/mvp/AskRich.tsx", import.meta.url), "utf8");
  assert.match(rich, /data-testid="ask-rich-detail"/);
  assert.match(rich, /<Link href=\{link\} onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("(b) the early dev probe is a self-contained script that records the key", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, location: g.location, error: console.error };
  g.window = globalThis;
  g.location = { pathname: "/ask", search: "" };
  const lines: string[] = [];
  console.error = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    new Function(EARLY_PROBE_SCRIPT)();
    console.error("Encountered two children with the same key, `0-Salesforce`. Keys should be unique", "\n    at Chips (AskScreen.tsx:1)");
    assert.deepEqual((g.__bubomapDuplicateKeys as { key: string }[]).map((hit) => hit.key), ["0-Salesforce"]);
    assert.match(lines[0], /\[BuboMap dev\] duplicate React key "0-Salesforce" on \/ask/);
  } finally {
    console.error = saved.error;
    g.window = saved.window;
    g.location = saved.location;
  }
});

test("thread: going back to an earlier question (or asking it again) updates it in place, never grows the thread", () => {
  let thread: Thread = { turns: [] };
  for (const q of ["A?", "B?", "C?"]) thread = addTurn(thread, turn(q));
  thread = addTurn(thread, { ...turn("B?"), summary: "B again" });
  assert.deepEqual(thread.turns.map((t) => t.question), ["A?", "B?", "C?"]);
  assert.equal(thread.turns[1].summary, "B again");
  assert.deepEqual(earlierTurns(thread, "B?").map((t) => t.question), ["A?"]);
});
