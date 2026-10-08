/**
 * Sign-in (single sign-on) links. One relationship type, authenticates_via, from an app or
 * platform to the app or platform people sign in through (usually Microsoft 365).
 * "Own login (no SSO)" is a property on the app itself (properties.sign_in = "own_login"),
 * so a confirmed no-SSO app is distinct from one where nothing is recorded.
 */

export const SIGN_IN_EDGE = "authenticates_via";
export const OWN_LOGIN = "own_login";
export const OWN_LOGIN_LABEL = "Own login (no SSO)";

const SIGN_IN_TYPES = new Set(["application", "solution", "technical_capability", "cloud_service"]);
const RETIRED = new Set(["retired", "end_of_life"]);

export function isOwnLogin(properties: Record<string, unknown> | null | undefined): boolean {
  return (properties ?? {}).sign_in === OWN_LOGIN;
}

/** Applications and platforms still in use. Servers, vendors and the rest never sign in through SSO here. */
export function isSignInCandidate(object: { type: string; status?: string | null; properties?: Record<string, unknown> | null }): boolean {
  if (!SIGN_IN_TYPES.has(object.type)) return false;
  const lifecycle = typeof object.properties?.lifecycle === "string" ? object.properties.lifecycle : "";
  return !RETIRED.has(object.status ?? "") && !RETIRED.has(lifecycle);
}
