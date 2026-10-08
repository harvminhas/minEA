/**
 * Stripe Checkout / Customer Portal decisions for the Plan & billing tab.
 * Pure helpers so the rules are unit-tested; the component only wires them up.
 */
import type { BillingStatus } from "@minea/types";
import type { DisplayPlanId, PackId } from "./plans";

/** What a pack button does. coming_soon = Stripe not configured for this org (old dialog). */
export type PackAction = "checkout" | "portal" | "coming_soon";

export function stripeLive(status: BillingStatus | undefined, previewing: boolean): boolean {
  return !previewing && !!status?.checkout_available;
}

/**
 * Free and Business (legacy) orgs have no subscription, so a pack button starts Checkout.
 * An org already on a pack switches in the Customer Portal (a second Checkout would create a
 * second subscription).
 */
export function packActionFor(
  realPlan: DisplayPlanId,
  status: BillingStatus | undefined,
  previewing: boolean
): PackAction {
  if (!stripeLive(status, previewing)) return "coming_soon";
  if (status?.has_subscription && realPlan !== "free" && realPlan !== "business_legacy") return "portal";
  return "checkout";
}

export function showManageBilling(status: BillingStatus | undefined, previewing: boolean): boolean {
  return stripeLive(status, previewing) && !!status?.has_billing_account;
}

export function canStartBilling(status: BillingStatus | undefined): boolean {
  return !!status?.can_manage_billing;
}

export type CheckoutReturn = "success" | "cancelled";

export function parseCheckoutReturn(raw: string | null | undefined): CheckoutReturn | null {
  return raw === "success" || raw === "cancelled" ? raw : null;
}

export function checkoutReturnNotice(value: CheckoutReturn): string {
  return value === "success"
    ? "Payment received. Your plan updates in a few seconds."
    : "Checkout cancelled. No charge was made.";
}

export function overCapBanner(used: number, cap: number): string {
  const extra = used - cap;
  return (
    `${used} people hold licences but your plan includes ${cap}. Everyone keeps access, ` +
    `but nobody new can be given edit access until ${extra} licence${extra === 1 ? " is" : "s are"} freed or you upgrade.`
  );
}

/** The API returns `409 {"code":…,"message":…} (/path)` or `403 Some text (/path)`. */
export function billingErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const body = raw.replace(/^\d{3}\s+/, "").replace(/\s+\(\/[^)]*\)$/, "");
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // plain-text detail
  }
  return body || "Something went wrong. Please try again.";
}

export function checkoutBody(pack: PackId, interval: "monthly" | "yearly") {
  return { plan: pack, interval } as const;
}
