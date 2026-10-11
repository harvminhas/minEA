/**
 * Help form and the "payment received, still setting up" state after Stripe Checkout.
 * Pure helpers (unit-tested); SupportDialog and useCheckoutWatch wire them up.
 */

export type SupportTopic = "billing" | "bug" | "other";

export const SUPPORT_TOPICS: { value: SupportTopic; label: string }[] = [
  { value: "billing", label: "Billing" },
  { value: "bug", label: "Something isn't working" },
  { value: "other", label: "Other" },
];

export interface SupportRequestBody {
  topic: SupportTopic;
  message: string;
  checkout_session_id: string | null;
  source: string | null;
}

export function supportRequestBody(input: {
  topic: SupportTopic;
  message: string;
  checkoutSessionId?: string | null;
  source?: string | null;
}): SupportRequestBody {
  return {
    topic: input.topic,
    message: input.message.trim(),
    checkout_session_id: parseCheckoutSessionId(input.checkoutSessionId),
    source: input.source?.trim() || null,
  };
}

/** Stripe Checkout session ids look like cs_test_… / cs_live_…; anything else is dropped. */
export function parseCheckoutSessionId(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return /^cs_[A-Za-z0-9_]{6,250}$/.test(value) ? value : null;
}

/** Show "still setting up" when the plan hasn't changed this long after returning from Stripe. */
export const CHECKOUT_SETUP_TIMEOUT_MS = 60_000;
/** Re-read billing status this often while waiting. */
export const CHECKOUT_POLL_MS = 3_000;
/** While "still setting up", tell the API this often (it emails the owner once, after 5 min). */
export const CHECKOUT_PENDING_REPORT_MS = 60_000;
/** Stop reporting after this long on the page. */
export const CHECKOUT_PENDING_REPORT_MAX_MS = 15 * 60_000;

export type CheckoutPhase = "confirming" | "active" | "still_setting_up";

export function checkoutPhase(elapsedMs: number, planActive: boolean): CheckoutPhase {
  if (planActive) return "active";
  return elapsedMs >= CHECKOUT_SETUP_TIMEOUT_MS ? "still_setting_up" : "confirming";
}

export const CHECKOUT_ACTIVE_NOTICE = "Payment received and your plan is active. Stripe has emailed you a receipt.";
export const STILL_SETTING_UP_TITLE = "Payment received, still setting up your plan";
export const STILL_SETTING_UP_BODY =
  "Your payment went through and Stripe has emailed you a receipt. Your plan usually updates within a " +
  "minute, but this one is taking longer. There's no need to pay again. You can keep using BuboMap, " +
  "and if it hasn't updated in a few minutes, let us know and we'll sort it out.";
export const STILL_SETTING_UP_MESSAGE =
  "I paid for a plan, but my organisation hasn't updated yet.";

export const SUPPORT_THANKS = "Thanks, we've got your message and will reply by email.";
