/**
 * billingui.v1 — pricing page and admin centre (Plan & billing, Licences, Onboarding).
 *
 * NEXT_PUBLIC_BILLING_UI=1 turns it on, =0 turns it off. Unset means on in local dev and
 * off in production builds, so the live site is unchanged until the flag is set.
 * Display only: nothing behind this flag changes an org's plan, limits or roles.
 */

export interface BillingFlagEnv {
  flag?: string | undefined;
  nodeEnv?: string | undefined;
}

const ON = new Set(["1", "true", "on", "yes"]);
const OFF = new Set(["0", "false", "off", "no"]);

// Next.js inlines NEXT_PUBLIC_* and NODE_ENV only when written out literally like this.
function readEnv(): BillingFlagEnv {
  return { flag: process.env.NEXT_PUBLIC_BILLING_UI, nodeEnv: process.env.NODE_ENV };
}

export function billingUiEnabled(env: BillingFlagEnv = readEnv()): boolean {
  const value = env.flag?.trim().toLowerCase();
  if (value && ON.has(value)) return true;
  if (value && OFF.has(value)) return false;
  return env.nodeEnv !== "production";
}

/**
 * Dev-only plan preview (?preview=starter|team|business|free on the admin centre).
 * Always off in production builds, whatever NEXT_PUBLIC_BILLING_UI says.
 */
export function billingPreviewEnabled(env: BillingFlagEnv = readEnv()): boolean {
  if (env.nodeEnv === "production") return false;
  return billingUiEnabled(env);
}
