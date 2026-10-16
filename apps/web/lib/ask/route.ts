/**
 * Ask routing: AI-first. Every typed question goes to the AI (/ai/ask/stream). The browser keeps
 * only name matching as a helper (lib/ask/names.ts) for the fallback list when the AI can't run.
 */
import type { AskAnswer } from "./deterministic";
import type { AskStep } from "@/lib/api-client";

export type ModelGate = {
  mode: "home" | "answer";
  question: string;
  /** The question is being read as an "add these" list, or we're asking which it is. */
  showingAdd: boolean;
  ambiguous: boolean;
  hasWorkspace: boolean;
  /** The catalogue has loaded (or failed). */
  catalogSettled: boolean;
  /** Ignored for routing (kept so callers can pass the fallback answer). */
  local?: Pick<AskAnswer, "handler">;
  /** The catalogue loaded and holds no applications or infrastructure: there is nothing to look up. */
  estateEmpty?: boolean;
};

export function shouldAskModel(gate: ModelGate): boolean {
  // AI-first: every typed question goes to the AI. The browser never reads the question's wording to
  // decide; it only waits for the catalogue (so name hints and the fallback list are ready).
  if (gate.mode !== "answer" || !gate.question.trim() || gate.showingAdd || gate.ambiguous || !gate.hasWorkspace) return false;
  if (!gate.catalogSettled) return false;
  // Empty estate: there is nothing to look up, and the card says so without spending an AI question.
  if (gate.estateEmpty) return false;
  return true;
}

/** What the card shows when the AI didn't answer (unavailable, error, timeout, over the allowance). */
export const LOCAL_ANSWER_STEP = "Showed name matches from your catalogue; the AI's answer wasn't available";

/** The AI's answer when there is one (including its "found nothing"); else the name-match fallback,
 * keeping every step the person saw live plus the reason line. */
export function pickAnswer(fallback: AskAnswer, fromModel: AskAnswer | null, _question: string, modelSteps?: AskStep[]): AskAnswer {
  if (fromModel) return fromModel;
  const seen = modelSteps ?? [];
  if (!seen.length) return fallback;
  return { ...fallback, steps: [...seen, { id: "local", status: "done", label: LOCAL_ANSWER_STEP }] };
}

export function sameQuestion(a: string, b: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase().replace(/[?.!\s]+$/g, "").replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

/** Topped up from here when an answer suggests fewer than three. */
export const DEFAULT_FOLLOW_UPS = [
  "What renews in the next 90 days?",
  "Which vendors do we spend the most with?",
  "What has no owner?",
  "What's out of support?",
];

/** "Ask next" chips: three, unique, and never the question just asked. */
export function followUpsFor(items: string[], question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...items, ...DEFAULT_FOLLOW_UPS]) {
    if (out.length === 3) break;
    const text = item.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key) || (question && sameQuestion(text, question))) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Steps can repeat an id (older servers sent "check" twice); keys must still be unique. */
export function stepKey(step: Pick<AskStep, "id">, index: number): string {
  return `${index}-${step.id}`;
}

/** The one honest line shown while the model works: what it is actually searching. */
export function workingLine(items: number): string {
  if (items <= 0) return "Looking through your estate";
  return `Looking through ${items.toLocaleString("en-US")} ${items === 1 ? "item" : "items"} in your estate`;
}
