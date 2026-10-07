import { annualCost } from "@/lib/cost/service";
import { readCostLines } from "@/lib/cost/math";
import { prepareRows, type AddRow } from "@/lib/setup/add-plan";
import type { EstateItem } from "@/lib/setup/add-plan";
import type { HostingChoice } from "@/lib/setup/match-tools";

export const MOTION_CSS =
  "@keyframes add-card-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.add-card-rise{animation:add-card-rise 320ms ease both;animation-delay:calc(var(--add-i) * 60ms)}@keyframes add-check{from{transform:scale(.6)}to{transform:scale(1)}}.add-check{animation:add-check 320ms ease}@keyframes add-saved-in{from{opacity:0}to{opacity:1}}.add-saved-in{animation:add-saved-in 320ms ease}";

export type AddReceipt = {
  question: string;
  added: string;
  kept: string;
  todos: string[];
  canUndo: boolean;
  objectIds: string[];
  relationshipIds: string[];
  undoUntil: number;
  names?: string[];
};

const RECEIPT_KEY = "bubomap-add-receipt";

export function addReceiptStorageKey(orgSlug: string, workspaceSlug: string): string {
  return `${RECEIPT_KEY}:${orgSlug}:${workspaceSlug}`;
}

export function readAddReceipt(orgSlug: string, workspaceSlug: string, question: string): AddReceipt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(addReceiptStorageKey(orgSlug, workspaceSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AddReceipt;
    if (Date.now() > parsed.undoUntil) return null;
    if (parsed.question !== question) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAddReceipt(orgSlug: string, workspaceSlug: string, receipt: AddReceipt): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(addReceiptStorageKey(orgSlug, workspaceSlug), JSON.stringify(receipt));
}

export function clearAddReceipt(orgSlug: string, workspaceSlug: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(addReceiptStorageKey(orgSlug, workspaceSlug));
}

export type AddPhase = "idle" | "saving" | "saved" | "error";
export type CardQuestion = "none" | "hosting" | "fuzzy";

const TINTS = ["#5b4ce6", "#0f766e", "#b45309", "#1d4ed8", "#be123c", "#6d28d9"];

export function logoInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function logoTint(name: string, custom: boolean): string {
  if (custom) return "#5b4ce6";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

/** One question at a time. A SaaS catalog match asks nothing. */
export function cardQuestion(row: AddRow): CardQuestion {
  if (row.existing) return "none";
  if (row.status === "weak" || row.status === "pick") return "fuzzy";
  if (row.kind === "server" || row.kind === "location" || row.kind === "vendor" || row.kind === "capability") return "none";
  if (row.kind === "platform") {
    const known = row.choice === "saas" || row.choice === "paas" || row.choice === "self_hosted" || row.tool?.hosting === "saas" || row.tool?.hosting === "paas";
    return known ? "none" : "hosting";
  }
  if (row.tool?.hosting === "saas" || row.choice === "saas") return "none";
  return "hosting";
}

export function hostingChoices(kind: string): { choice: HostingChoice; label: string }[] {
  if (kind === "platform") {
    return [
      { choice: "saas", label: "SaaS" },
      { choice: "paas", label: "PaaS" },
      { choice: "self_hosted", label: "Self-hosted" },
      { choice: "unknown", label: "Don't know" },
    ];
  }
  return [
    { choice: "saas", label: "SaaS" },
    { choice: "own", label: "Our server" },
    { choice: "unknown", label: "Don't know" },
  ];
}

export function recordsTitle(rows: { name: string }[]): string {
  if (rows.length === 1) return `You already have ${rows[0]!.name}`;
  return `You already have all ${rows.length}`;
}

function addNoun(rows: { kind: string }[]): string {
  const platform = rows.length > 0 && rows.every((row) => row.kind === "platform");
  if (platform) return rows.length === 1 ? "platform" : "platforms";
  return rows.length === 1 ? "app" : "apps";
}

export function cardsTitle(rows: { kind: string }[]): string {
  return `Add ${rows.length} ${addNoun(rows)} to your map`;
}

export function cardsSubtitle(questionCount: number): string {
  if (questionCount <= 0) return "We filled in what we know. Owners and renewals can wait.";
  const questions = questionCount === 1 ? "one quick question" : `${questionCount} quick questions`;
  return `We filled in what we know; ${questions}. Owners and renewals can wait.`;
}

export function askButtonLabel(rows: { kind: string }[]): string {
  return `Add ${rows.length} ${addNoun(rows)}`;
}

/** The line under a catalog match. A platform says platform hosting. */
export function catalogHostingLine(row: AddRow): string | null {
  if (cardQuestion(row) !== "none") return null;
  if (row.kind === "platform") {
    const known = row.choice === "saas" || row.choice === "paas" || row.choice === "self_hosted" || row.tool?.hosting === "saas" || row.tool?.hosting === "paas";
    return known ? "Platform hosting, nothing to ask" : null;
  }
  const saas = row.choice === "saas" || row.tool?.hosting === "saas";
  if (!saas) return null;
  return "Cloud app (SaaS), nothing to ask";
}

export function savedAdded(names: string[]): string {
  if (names.length === 0) return "";
  return `Added ${names.length} ${names.length === 1 ? "app" : "apps"}: ${names.join(", ")}.`;
}

export function undoneSentence(names: string[]): string {
  if (names.length === 1) return `Undone: ${names[0]} removed`;
  if (names.length > 1) return `Undone: ${names.join(", ")} removed`;
  return "Undone.";
}

export function savedKept(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} was already there, so nothing changed.`;
  return `${names.join(", ")} were already there, so nothing changed.`;
}

export type GapField = "owner" | "renewal" | "criticality";

export function firstGap(item: { owner: string; renewal: string; criticality: string }): { field: GapField; label: string } | null {
  if (!item.owner.trim()) return { field: "owner", label: "No owner" };
  if (!item.renewal.trim()) return { field: "renewal", label: "No renewal date" };
  if (!item.criticality.trim()) return { field: "criticality", label: "No criticality" };
  return null;
}

export function recordSubtitle(type: string, vendor: string, saas: boolean): string {
  const kind = type === "cloud_service" ? "Platform" : type === "model" ? "Server" : "App";
  const suite = type === "cloud_service" && saas ? "SaaS suite" : saas ? "SaaS" : "";
  return [kind, suite, vendor].filter(Boolean).join(" · ");
}

export function costShareLine(properties: Record<string, unknown> | null | undefined, dependentCount: number): { amount: string; detail: string } {
  const cost = annualCost(properties);
  const lines = readCostLines(properties) ?? [];
  const seats = lines.reduce((sum, line) => (line.calculation.kind === "per_user" ? sum + line.calculation.seats : sum), 0);
  const parts: string[] = [];
  if (seats > 0) parts.push(seats === 1 ? "1 seat" : `${seats} seats`);
  if (dependentCount > 0) parts.push(`shared by ${dependentCount} ${dependentCount === 1 ? "app" : "apps"}`);
  const amount = cost.missing ? "" : cost.label;
  return { amount, detail: parts.join(" · ") };
}

export function noticeDeadline(renewal: string, noticeDays: number): string {
  const date = new Date(`${renewal.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() - noticeDays);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatRenewal(renewal: string): string {
  const date = new Date(`${renewal.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return renewal;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type AddResultView = {
  mode: "records" | "cards" | "saved" | "closed";
  title: string;
  subtitle: string;
  recordCards: AddRow[];
  addCards: AddRow[];
  alreadyLines: AddRow[];
  button: string | null;
  showsAdded: boolean;
  questions: CardQuestion[];
  motion: boolean;
};

/** What the Ask result is allowed to show. Confirmation exists only in the saved phase. */
export function viewFromRows(rows: AddRow[], phase: AddPhase, reduced = false): AddResultView {
  const fresh = rows.filter((row) => !row.existing);
  const known = rows.filter((row) => row.existing);
  const questions = fresh.map(cardQuestion);
  const motion = !reduced && phase !== "saved";

  if (phase === "saved") {
    return {
      mode: "saved",
      title: "",
      subtitle: "",
      recordCards: [],
      addCards: [],
      alreadyLines: [],
      button: null,
      showsAdded: fresh.length > 0,
      questions: [],
      motion: !reduced,
    };
  }
  if (fresh.length === 0 && known.length === 0) {
    return { mode: "closed", title: "", subtitle: "", recordCards: [], addCards: [], alreadyLines: [], button: null, showsAdded: false, questions: [], motion: false };
  }
  if (fresh.length === 0) {
    return {
      mode: "records",
      title: recordsTitle(known),
      subtitle: "",
      recordCards: known,
      addCards: [],
      alreadyLines: [],
      button: null,
      showsAdded: false,
      questions: [],
      motion: false,
    };
  }
  const questionCount = questions.filter((question) => question !== "none").length;
  return {
    mode: "cards",
    title: cardsTitle(fresh),
    subtitle: cardsSubtitle(questionCount),
    recordCards: [],
    addCards: fresh,
    alreadyLines: known,
    button: phase === "saving" ? "Adding…" : phase === "error" ? "Retry" : askButtonLabel(fresh),
    showsAdded: false,
    questions,
    motion,
  };
}

export function describeAddResult(input: {
  text: string;
  estate: EstateItem[];
  phase: AddPhase;
  kind?: "app" | "platform";
  removed?: string[];
  reduced?: boolean;
}): AddResultView {
  const removed = new Set(input.removed ?? []);
  const rows = prepareRows(input.text, input.kind ?? "app", input.estate).filter((row) => !removed.has(row.key));
  return viewFromRows(rows, input.phase, input.reduced);
}
