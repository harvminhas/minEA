/**
 * The plan's item limit per workspace (max_objects_per_workspace: 50 on Free, none on Starter and up).
 *
 * The API refuses a create that would pass the cap with
 *   403 {"code":"limit_exceeded","limit":"max_objects_per_workspace","current","max","adding","remaining","plan"}
 * apiFetch turns that into an ObjectLimitError whose message is the friendly line below, so every
 * single-add form that shows err.message reads "Free includes up to 50 items…" instead of raw JSON,
 * and a toast with the right upgrade link pops up (see ObjectLimitNotice). The Add cards pre-check
 * with GET …/objects/limit and show the upgrade panel instead.
 */
import type { BillingStatus } from "@minea/types";
import { PLAN_LABELS, PLAN_OBJECT_LIMITS, normalizePlan, objectCreateBlockedMessage } from "@/lib/plan-features";
import { starterBillingHref } from "@/lib/billing/plan-intent";
import { adminTabHref } from "@/lib/billing/admin-centre";
import { businessGetStartedHref } from "@/lib/billing/business-request";

export const OBJECT_LIMIT_KEY = "max_objects_per_workspace";
export const OBJECT_LIMIT_EVENT = "bubomap:object-limit";

export interface ObjectLimitDetail {
  code: "limit_exceeded";
  limit: typeof OBJECT_LIMIT_KEY;
  current: number;
  max: number;
  adding?: number;
  remaining?: number;
  plan?: string;
}

/** GET …/objects/limit: max and remaining are null when the plan has no item limit. */
export interface ObjectRoom {
  limit: typeof OBJECT_LIMIT_KEY;
  current: number;
  max: number | null;
  remaining: number | null;
  plan: string;
}

/** The 403 body's detail, when it is the item limit. */
export function objectLimitDetail(detail: unknown): ObjectLimitDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  if (d.code !== "limit_exceeded" || d.limit !== OBJECT_LIMIT_KEY) return null;
  if (typeof d.current !== "number" || typeof d.max !== "number") return null;
  return d as unknown as ObjectLimitDetail;
}

export function objectLimitMessage(detail: Pick<ObjectLimitDetail, "max" | "plan">): string {
  return objectCreateBlockedMessage(detail.plan ?? "free", detail.max);
}

export class ObjectLimitError extends Error {
  readonly status = 403;
  constructor(readonly detail: ObjectLimitDetail, readonly path = "") {
    super(objectLimitMessage(detail));
    this.name = "ObjectLimitError";
  }
}

/** The item-limit detail behind an error: an ObjectLimitError, or a raw "403 {…} (path)" message. */
export function objectLimitFromError(err: unknown): ObjectLimitDetail | null {
  if (err instanceof ObjectLimitError) return err.detail;
  if (err && typeof err === "object" && "detail" in err) {
    const found = objectLimitDetail((err as { detail: unknown }).detail);
    if (found) return found;
  }
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const match = /^403\s+(\{[\s\S]*\})(?:\s+\([^)]*\))?$/.exec(message.trim());
  if (!match) return null;
  try {
    return objectLimitDetail(JSON.parse(match[1]));
  } catch {
    return null;
  }
}

/** Which upgrade offer this person gets. */
export type LimitOffer =
  | "upgrade" // owner/admin, checkout open: Upgrade to Starter
  | "checkout-closed" // owner/admin, checkout not open for this org yet: Business quote
  | "business" // NEXT_PUBLIC_BILLING_UI off: Business Get started
  | "ask-admin"; // member, viewer or unverified email: ask an owner or admin

export function limitOffer(status: Pick<BillingStatus, "can_manage_billing" | "paid_plans_available"> | null | undefined, billingUi: boolean): LimitOffer {
  if (!status?.can_manage_billing) return "ask-admin";
  if (!billingUi) return "business";
  return status.paid_plans_available === false ? "checkout-closed" : "upgrade";
}

export interface LimitLink {
  label: string;
  href: string;
}

/** The one primary link for an offer (none for ask-admin: they can't buy). */
export function limitLink(offer: LimitOffer, orgSlug: string): LimitLink | null {
  switch (offer) {
    case "upgrade":
      return { label: "Upgrade to Starter", href: starterBillingHref(orgSlug) };
    case "checkout-closed":
      return { label: "Business: get a quote", href: businessGetStartedHref({ org: orgSlug, from: "add_limit" }) };
    case "business":
      return { label: "Get started with Business", href: businessGetStartedHref({ org: orgSlug, from: "add_limit" }) };
    case "ask-admin":
      return null;
  }
}

/** What the Add cards show: room on the plan for this Add. */
export interface LimitState {
  plan: string;
  label: string;
  max: number;
  used: number;
  adding: number;
  room: number;
  /** More is being added than fits: stop and show the upgrade panel. */
  over: boolean;
  /** Cards on screen (one card can bring a new cloud tenant along, so cards ≤ items). */
  cards: number;
  /** How many cards, in paste order, fit in the room left. */
  fitCards: number;
  offer: LimitOffer;
  orgSlug: string;
}

/**
 * Room for this Add. Uses the server's count and cap (org overrides included) when known, else the
 * plan default and the catalogue count, so the pre-check works before GET …/objects/limit answers.
 * null when the plan has no item limit.
 */
export function limitState(input: {
  plan: string | null | undefined;
  room?: ObjectRoom | null;
  catalogCount: number;
  adding: number;
  offer: LimitOffer;
  orgSlug: string;
  /** Defaults to adding (one item per card). */
  cards?: number;
  /** Items the first k cards create; defaults to k. */
  itemsFor?: (cards: number) => number;
}): LimitState | null {
  const plan = normalizePlan(input.room?.plan ?? input.plan);
  const max = input.room ? input.room.max : PLAN_OBJECT_LIMITS[plan];
  if (max == null) return null;
  // The room query can lag a save made here; the catalogue already has the new items.
  const used = input.room ? Math.max(input.room.current, input.catalogCount) : input.catalogCount;
  const room = Math.max(0, max - used);
  const cards = input.cards ?? input.adding;
  const over = input.adding > room;
  return {
    plan,
    label: PLAN_LABELS[plan] ?? "Free",
    max,
    used,
    adding: input.adding,
    room,
    over,
    cards,
    fitCards: over ? cardsThatFit(cards, input.itemsFor ?? ((k) => k), room) : cards,
    offer: input.offer,
    orgSlug: input.orgSlug,
  };
}

/** The most cards (from the top) whose items fit in `room`. itemsFor grows with the count. */
export function cardsThatFit(cards: number, itemsFor: (count: number) => number, room: number): number {
  let lo = 0;
  let hi = cards;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (itemsFor(mid) <= room) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A 403 from the server wins over the pre-check (another tab may have added items meanwhile). */
export function roomFromDetail(detail: ObjectLimitDetail): ObjectRoom {
  return {
    limit: OBJECT_LIMIT_KEY,
    current: detail.current,
    max: detail.max,
    remaining: detail.remaining ?? Math.max(0, detail.max - detail.current),
    plan: detail.plan ?? "free",
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function roomHintText(limit: LimitState): string {
  return limit.room === 0 ? `${limit.label} is full (${limit.used} of ${limit.max})` : `${limit.room} left on ${limit.label}`;
}

export function limitPanelCopy(limit: LimitState, starterPrice: string): { title: string; body: string; footnote: string } {
  const fits = Math.min(limit.adding, limit.room);
  const left = limit.cards - limit.fitCards;
  const isFree = limit.plan === "free";
  const title = limit.used > limit.max
    ? `This workspace is over the ${limit.label} limit of ${limit.max} items`
    : limit.room === 0
      ? `${limit.label} is full: ${limit.used} of ${limit.max} items`
      : `${limit.label} covers up to ${limit.max} items in a workspace`;
  const more = isFree ? ` Starter (${starterPrice}) has no item limit.` : "";
  const body = limit.room === 0
    ? `${plural(limit.adding, "item")} ${limit.adding === 1 ? "is" : "are"} waiting on the cards below.${more}`
    : `You have ${limit.used} and are adding ${limit.adding}, so ${fits} fit.${more}`;
  const footnote = left <= 0
    ? ""
    : `${limit.fitCards > 0 ? `The other ${left} stay on the cards` : "They stay on the cards"}, so you can add ${left === 1 ? "it" : "them"} after upgrading.${limit.fitCards > 0 ? " Nothing is saved until you choose." : ""}`;
  return { title, body, footnote };
}

/** After "Add the first N for now": "Added 50 apps. 69 not added (Free is full)". */
export function partialSummary(added: number, notAdded: number, label = "Free", noun: "apps" | "platforms" = "apps"): string {
  const one = noun === "apps" ? "app" : "platform";
  return `Added ${added} ${added === 1 ? one : noun}. ${notAdded} not added (${label} is full)`;
}

/** The quiet link inside the collapsed "not added" row (the person already chose; no big button). */
export function restLink(offer: LimitOffer, orgSlug: string): LimitLink | null {
  switch (offer) {
    case "upgrade":
      return { label: "Upgrade to add the rest", href: starterBillingHref(orgSlug) };
    case "business":
      return { label: "Upgrade to Business to add the rest", href: businessGetStartedHref({ org: orgSlug, from: "add_limit" }) };
    case "checkout-closed":
      return { label: "Get a Business quote to add the rest", href: businessGetStartedHref({ org: orgSlug, from: "add_limit" }) };
    case "ask-admin":
      return null;
  }
}

/**
 * New applications the cards would still save: the ones that fit, none once the person has chosen
 * "Add the first N" (the rest wait for an upgrade). The setup pill adds this to the saved apps.
 */
export function pendingAppCount(freshTypes: string[], limit: Pick<LimitState, "over" | "fitCards"> | null, partialDone: boolean): number {
  if (partialDone) return 0;
  const fits = limit?.over ? limit.fitCards : freshTypes.length;
  return freshTypes.slice(0, fits).filter((type) => type === "application").length;
}

/** The first `count` new rows in paste order; rows already in the map always go along (updates). */
export function takeFirst<T extends { key: string; existing?: unknown }>(rows: T[], count?: number): { planned: T[]; taken: Set<string>; fresh: number } {
  const fresh = rows.filter((row) => !row.existing);
  const taken = new Set(fresh.slice(0, count ?? fresh.length).map((row) => row.key));
  return { planned: rows.filter((row) => row.existing || taken.has(row.key)), taken, fresh: fresh.length };
}

/** Tell the app an item-limit 403 happened (ObjectLimitNotice shows the toast). */
export function announceObjectLimit(detail: ObjectLimitDetail): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(OBJECT_LIMIT_EVENT, { detail }));
}

/** The single-add toast: what happened, and the next step this person can take. */
export function objectLimitToastCopy(detail: ObjectLimitDetail, offer: LimitOffer): { title: string; description: string } {
  const plan = normalizePlan(detail.plan ?? "free");
  const label = plan === "free" ? "Free" : "This workspace";
  const title = detail.current > detail.max
    ? `This workspace is over the ${plan === "free" ? "Free " : ""}limit of ${detail.max} items`
    : `${label} is full: ${detail.current} of ${detail.max} items`;
  const what = plan === "free"
    ? `Free includes up to ${detail.max} items (apps, platforms, servers…) in a workspace.`
    : `This workspace's limit is ${detail.max} items.`;
  const next = {
    upgrade: plan === "free" ? "Starter has no item limit." : "Change the plan in Settings → Plan & billing.",
    "checkout-closed": "Card checkout for Starter isn't open yet; Business has no item limit.",
    business: "Business has no item limit.",
    "ask-admin": "Ask an owner or admin to upgrade the plan.",
  }[offer];
  return { title, description: `${what} ${next}` };
}
