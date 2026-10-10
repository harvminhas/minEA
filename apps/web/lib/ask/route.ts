/**
 * Local-or-model routing for Ask, decided BEFORE any model call.
 *
 * The browser answers some questions itself from the catalogue (answerFromRecords). For those the
 * local answer always wins, so calling Gemini would be paid for and thrown away (the old "wasted
 * Gemini call"). shouldAskModel says whether the model is needed at all; pickAnswer chooses what
 * to show once both are in.
 */
import { isAiDataQuestion } from "./answerStrategies";
import type { AskAnswer } from "./deterministic";
import type { AskStep } from "@/lib/api-client";

/** Handlers whose local answer is always shown, so the model is never asked. */
export const LOCAL_ONLY_HANDLERS: ReadonlySet<AskAnswer["handler"]> = new Set([
  "gaps",
  "impact",
  "importance",
  "cost",
  "ownership",
  "clarify",
  "aging",
  "sign_in",
]);

/** True when the local answer will be shown whatever the model says. */
export function localOnly(local: Pick<AskAnswer, "handler">, question: string): boolean {
  if (LOCAL_ONLY_HANDLERS.has(local.handler)) return true;
  // Customer / financial / personal data: the F1 rule (each app's Holds data) answers, not the model.
  if (local.handler === "ai" && isAiDataQuestion(question)) return true;
  return false;
}

export type ModelGate = {
  mode: "home" | "answer";
  question: string;
  /** The question is being read as an "add these" list, or we're asking which it is. */
  showingAdd: boolean;
  ambiguous: boolean;
  hasWorkspace: boolean;
  /** The catalogue has loaded (or failed), so the local handler is final. */
  catalogSettled: boolean;
  local: Pick<AskAnswer, "handler">;
  /** The catalogue loaded and holds no applications or infrastructure: there is nothing to look up. */
  estateEmpty?: boolean;
};

export function shouldAskModel(gate: ModelGate): boolean {
  if (gate.mode !== "answer" || !gate.question || gate.showingAdd || gate.ambiguous || !gate.hasWorkspace) return false;
  // Wait for the catalogue: until then the local handler can still change (AI, clarify), and a
  // call started early could be one we then throw away.
  if (!gate.catalogSettled) return false;
  // Empty estate: the local answer already says nothing is recorded; a model call would find nothing.
  if (gate.estateEmpty) return false;
  return !localOnly(gate.local, gate.question);
}

/** What the answer card shows. Same rules as before, now in one tested place. */
export function pickAnswer(
  local: AskAnswer,
  fromModel: AskAnswer | null,
  question: string,
  modelSteps?: AskStep[]
): AskAnswer {
  if (localOnly(local, question)) return local;
  if (fromModel && fromModel.handler !== "unsupported" && !(local.handler === "vendors" && fromModel.citations.length === 0)) {
    return fromModel;
  }
  // The model was asked but its answer isn't shown (no answer, unsupported, or a vendor list without
  // sources). Its lookups were still real, so show them; drop the "checked the answer" lines, which
  // describe an answer that isn't on screen.
  const lookups = (modelSteps ?? []).filter((step) => !step.id.startsWith("check"));
  return lookups.length ? { ...local, steps: lookups } : local;
}

function sameQuestion(a: string, b: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase().replace(/[?.!\s]+$/g, "").replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

/** "Ask next" chips: unique, and never the question just asked. */
export function followUpsFor(items: string[], question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
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
