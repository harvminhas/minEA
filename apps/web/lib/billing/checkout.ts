/**
 * Stripe Checkout / Customer Portal decisions for the Plan & billing tab.
 * Pure helpers so the rules are unit-tested; the component only wires them up.
 */
import type { BillingStatus } from "@minea/types";
import type { DisplayPlanId, PackId } from "./plans";

/**
 * What a pack button does.
 * - checkout: start Stripe Checkout.
 * - portal: change plan in the Customer Portal (org already has a subscription).
 * - unavailable: paid plans are "coming soon" for this org (API paid_plans_available=false);
 *   the button is disabled and reads "Coming soon".
 * - coming_soon: Stripe not configured for this org on an older API, or previewing (old dialog).
 */
export type PackAction = "checkout" | "portal" | "unavailable" | "coming_soon";

export const PAID_COMING_SOON_LABEL = "Coming soon";

export function stripeLive(status: BillingStatus | undefined, previewing: boolean): boolean {
  return !previewing && !!status?.checkout_available;
}

/**
 * An org with a Stripe subscription changes plans in the Customer Portal only. Starting Checkout
 * would create a SECOND subscription (the live-test bug: right after a portal switch the tab
 * briefly showed "Business (legacy)" with Switch buttons).
 */
export function packActionFor(
  realPlan: DisplayPlanId,
  status: BillingStatus | undefined,
  previewing: boolean
): PackAction {
  if (previewing) return "coming_soon";
  const live = stripeLive(status, previewing);
  // Subscribed orgs keep the portal even while paid plans are closed to new buyers.
  if (live && status?.has_subscription) return "portal";
  // Server says this org may not start a paid plan: disabled "Coming soon".
  if (status?.paid_plans_available === false) return "unavailable";
  if (!live) return "coming_soon";
  // Older API without checkout_allowed: has_subscription above is the rule.
  if (status?.checkout_allowed === false) return "portal";
  return "checkout";
}

/** Manage billing: any org with a Stripe subscription, plus orgs with past invoices (customer). */
export function showManageBilling(status: BillingStatus | undefined, previewing: boolean): boolean {
  return stripeLive(status, previewing) && (!!status?.has_subscription || !!status?.has_billing_account);
}

export function canStartBilling(status: BillingStatus | undefined): boolean {
  return !!status?.can_manage_billing;
}

export type CheckoutReturn = "success" | "cancelled";

export function parseCheckoutReturn(raw: string | null | undefined): CheckoutReturn | null {
  return raw === "success" || raw === "cancelled" ? raw : null;
}

/** True on the page the Customer Portal sends the user back to (?portal=return). */
export function parsePortalReturn(raw: string | null | undefined): boolean {
  return raw === "return";
}

export const PORTAL_RETURN_NOTICE = "Back from billing. Plan changes can take a few seconds to show here.";

/** Re-read billing status this often (ms) after returning from Checkout or the portal. */
export const RETURN_REFETCH_MS = [2000, 5000, 10000, 20000] as const;

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
