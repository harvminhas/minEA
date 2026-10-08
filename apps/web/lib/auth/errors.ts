/**
 * Sign-in error handling for Google / Microsoft popups and the password form.
 * Pure helpers (no Firebase import) so the wording is unit-tested.
 */

export type SocialProvider = "google" | "microsoft";
export type SignInMethod = SocialProvider | "password";

export const PROVIDER_LABEL: Record<SignInMethod, string> = {
  google: "Google",
  microsoft: "Microsoft",
  password: "email and password",
};

/** Firebase provider ids, as in fetchSignInMethodsForEmail and user.providerData. */
export const PROVIDER_ID: Record<SignInMethod, string> = {
  google: "google.com",
  microsoft: "microsoft.com",
  password: "password",
};

export type AuthErrorKind =
  | "cancelled"
  | "popup_blocked"
  | "provider_disabled"
  | "account_exists"
  | "unauthorized_domain"
  | "network"
  | "bad_credentials"
  | "too_many_requests"
  | "user_disabled"
  | "other";

export interface AuthErrorInfo {
  kind: AuthErrorKind;
  code: string | null;
  message: string;
  /** The email Firebase reports for account-exists errors (customData.email). */
  email: string | null;
}

export function authErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function errorEmail(err: unknown): string | null {
  if (err && typeof err === "object" && "customData" in err) {
    const email = (err as { customData?: { email?: unknown } }).customData?.email;
    return typeof email === "string" && email ? email : null;
  }
  return null;
}

/** Map a Firebase auth error to a kind and a sentence a person can act on. */
export function describeAuthError(err: unknown, method: SignInMethod = "google"): AuthErrorInfo {
  const code = authErrorCode(err);
  const email = errorEmail(err);
  const label = PROVIDER_LABEL[method];
  const info = (kind: AuthErrorKind, message: string): AuthErrorInfo => ({ kind, code, message, email });
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return info("cancelled", "Sign-in was cancelled. Try again when you're ready.");
    case "auth/popup-blocked":
      return info(
        "popup_blocked",
        `Your browser blocked the ${label} sign-in window. Allow pop-ups for this site, then try again.`
      );
    case "auth/operation-not-allowed":
      return info(
        "provider_disabled",
        method === "microsoft"
          ? "Microsoft sign-in isn't available yet. Please use Google for now."
          : `${label[0]!.toUpperCase()}${label.slice(1)} sign-in isn't available right now.`
      );
    case "auth/account-exists-with-different-credential":
      return info(
        "account_exists",
        `${email ?? "This email"} already has a BuboMap account that signs in another way.`
      );
    case "auth/unauthorized-domain":
      return info(
        "unauthorized_domain",
        "Sign-in pop-ups aren't allowed on this web address yet. Use the main BuboMap site."
      );
    case "auth/network-request-failed":
      return info("network", "Couldn't reach the sign-in service. Check your connection and try again.");
    case "auth/too-many-requests":
      return info("too_many_requests", "Too many attempts. Wait a few minutes and try again.");
    case "auth/user-disabled":
      return info("user_disabled", "This account has been disabled. Contact support if you think that's a mistake.");
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return info(
        "bad_credentials",
        method === "password"
          ? "That email and password don't match."
          : `${label} couldn't confirm the sign-in. Try again.`
      );
    default:
      break;
  }
  const fallback = err instanceof Error && err.message ? err.message : "Sign-in failed. Please try again.";
  return info("other", fallback);
}

export interface ExistingAccountAdvice {
  message: string;
  /** Ways to sign in to the existing account, in the order to offer them. */
  options: SignInMethod[];
}

/**
 * After auth/account-exists-with-different-credential: tell the person how to get into the
 * account they already have. `methods` comes from fetchSignInMethodsForEmail, which returns []
 * when email-enumeration protection is on, so an empty list gets a generic answer.
 */
export function existingAccountAdvice(
  attempted: SocialProvider,
  email: string | null,
  methods: readonly string[]
): ExistingAccountAdvice {
  const who = email ?? "This email";
  const known = (["google", "microsoft", "password"] as const).filter(
    (m) => m !== attempted && methods.includes(PROVIDER_ID[m])
  );
  const linkNote = `We'll connect ${PROVIDER_LABEL[attempted]} to the same account, so either works next time.`;
  if (known.length === 1) {
    const only = known[0]!;
    const how = only === "password" ? "your email and password (once)" : PROVIDER_LABEL[only];
    return {
      message: `${who} already has a BuboMap account that signs in with ${PROVIDER_LABEL[only]}. Sign in with ${how} below. ${linkNote}`,
      options: [only],
    };
  }
  if (known.length > 1) {
    return {
      message: `${who} already has a BuboMap account. Sign in with ${known.map((m) => PROVIDER_LABEL[m]).join(" or ")} below. ${linkNote}`,
      options: [...known],
    };
  }
  const others = (["google", "microsoft"] as const).filter((m) => m !== attempted);
  return {
    message: `${who} already has a BuboMap account that signs in another way. Sign in the way you did before (${PROVIDER_LABEL[others[0]!]}, or email and password). ${linkNote}`,
    options: [...others, "password"],
  };
}

/** Shown under the buttons when the password form is hidden (production). */
export const PASSWORD_USERS_NOTE =
  "Used an email and password before? Continue with Google or Microsoft using the same email address. Your account and data stay the same.";
