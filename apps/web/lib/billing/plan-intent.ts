/**
 * "Get Starter" on the public pricing page: signed out → sign up → (create org) → the org's
 * Plan & billing tab, which starts Starter checkout; signed in → /home → the same tab.
 * The intent rides in the URL (?plan=starter) and in sessionStorage, because org creation
 * (/onboarding) drops the redirect URL. Nothing here charges anyone: Stripe Checkout still asks.
 */
import { adminTabHref } from "./admin-centre";
import type { BillingStatus } from "@minea/types";
import { packActionFor } from "./checkout";
import type { DisplayPlanId } from "./plans";

export type PlanIntent = "starter";
export const PLAN_INTENT_KEY = "bubomap.planIntent";
export const STARTER_HOME_HREF = "/home?plan=starter";
export const START_PARAM = "start";

export function parsePlanIntent(raw: string | null | undefined): PlanIntent | null {
  return raw === "starter" ? "starter" : null;
}

/** Where the Starter button goes. */
export function starterCtaHref(signedIn: boolean): string {
  return signedIn ? STARTER_HOME_HREF : `/auth/sign-up?redirect_url=${encodeURIComponent(STARTER_HOME_HREF)}`;
}

/** The org's Plan & billing tab, told to start Starter checkout. */
export function starterBillingHref(orgSlug: string): string {
  const href = adminTabHref(orgSlug, "billing");
  return `${href}${href.includes("?") ? "&" : "?"}${START_PARAM}=starter`;
}

/** The org in a post-login destination like /orgs/acme/workspaces/default/ask. */
export function orgSlugFromPath(path: string | null | undefined): string | null {
  const match = /^\/orgs\/([^/?#]+)/.exec(path ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}

/** Start checkout on arrival only when the server says this org can buy and this user may. */
export function shouldAutoStartStarter(
  intent: PlanIntent | null,
  realPlan: DisplayPlanId | null,
  status: BillingStatus | undefined,
): boolean {
  if (intent !== "starter" || !realPlan || !status) return false;
  if (realPlan !== "free") return false; // already on a plan: the tab shows the portal instead
  return !!status.can_manage_billing && packActionFor(realPlan, status, false) === "checkout";
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function savePlanIntent(intent: PlanIntent): void {
  store()?.setItem(PLAN_INTENT_KEY, intent);
}

/** Read and clear. */
export function takePlanIntent(): PlanIntent | null {
  const s = store();
  const value = parsePlanIntent(s?.getItem(PLAN_INTENT_KEY));
  s?.removeItem(PLAN_INTENT_KEY);
  return value;
}
