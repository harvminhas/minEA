/**
 * billingui.v1 — pricing page and admin centre (Plan & billing, Licences, Onboarding).
 *
 * NEXT_PUBLIC_BILLING_UI=1 turns it on, =0 turns it off. Unset means on in local dev and
 * off in production builds, so the live site is unchanged until the flag is set.
 * Display only: nothing behind this flag changes an org's plan, limits or roles.
 */

import { devDefaultFlag } from "../env-flag";

export interface BillingFlagEnv {
  flag?: string | undefined;
  nodeEnv?: string | undefined;
}

// Next.js inlines NEXT_PUBLIC_* and NODE_ENV only when written out literally like this.
function readEnv(): BillingFlagEnv {
  return { flag: process.env.NEXT_PUBLIC_BILLING_UI, nodeEnv: process.env.NODE_ENV };
}

export function billingUiEnabled(env: BillingFlagEnv = readEnv()): boolean {
  return devDefaultFlag(env.flag, env.nodeEnv);
}

/**
 * Dev-only plan preview (?preview=starter|team|business|free on the admin centre).
 * Always off in production builds, whatever NEXT_PUBLIC_BILLING_UI says.
 */
export function billingPreviewEnabled(env: BillingFlagEnv = readEnv()): boolean {
  if (env.nodeEnv === "production") return false;
  return billingUiEnabled(env);
}
