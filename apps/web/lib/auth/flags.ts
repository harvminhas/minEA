/**
 * Email/password sign-in and sign-up. Production sign-in is Google or Microsoft only.
 *
 * NEXT_PUBLIC_PASSWORD_SIGNIN=1 turns the password form on, =0 turns it off. Unset means on in
 * `next dev` (local and tunnel testing use a password test account because Google popups fail on
 * the tunnel) and off in production builds. Same rule as NEXT_PUBLIC_BILLING_UI.
 *
 * Existing password users are not locked out: they sign in with Google or Microsoft using the
 * same email (see SocialSignIn for the one-time link when Firebase asks for the old method).
 */
import { devDefaultFlag } from "../env-flag";

export interface PasswordFlagEnv {
  flag?: string | undefined;
  nodeEnv?: string | undefined;
}

// Next.js inlines NEXT_PUBLIC_* and NODE_ENV only when written out literally like this.
function readEnv(): PasswordFlagEnv {
  return { flag: process.env.NEXT_PUBLIC_PASSWORD_SIGNIN, nodeEnv: process.env.NODE_ENV };
}

export function passwordSignInEnabled(env: PasswordFlagEnv = readEnv()): boolean {
  return devDefaultFlag(env.flag, env.nodeEnv);
}
