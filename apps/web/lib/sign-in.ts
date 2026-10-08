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

/** Types a sign-in link can point at (and come from). Matches ALLOWED_TRIPLES after the solution/capability copy. */
export const SIGN_IN_TARGETS = ["application", "solution", "technical_capability", "cloud_service"] as const;

/** How many records sign in with each provider. */
export function signInCounts(relationships: readonly { type: string; to_object_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rel of relationships) {
    if (rel.type === SIGN_IN_EDGE) counts.set(rel.to_object_id, (counts.get(rel.to_object_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Picker order for "Signs in with": records others already sign in with (most used first),
 * then known identity providers, then everything else in its original order.
 */
export function orderSignInChoices<T extends { id: string }>(
  choices: readonly T[],
  counts: ReadonlyMap<string, number>,
  isIdentityProvider: (choice: T) => boolean = () => false
): T[] {
  const rank = (choice: T) => ((counts.get(choice.id) ?? 0) > 0 ? 0 : isIdentityProvider(choice) ? 1 : 2);
  return choices
    .map((choice, index) => ({ choice, index }))
    .sort(
      (a, b) =>
        rank(a.choice) - rank(b.choice) ||
        (counts.get(b.choice.id) ?? 0) - (counts.get(a.choice.id) ?? 0) ||
        a.index - b.index
    )
    .map((item) => item.choice);
}

/** Exclusive pick: Own login clears the providers, and a provider clears Own login. */
export function toggleSignInPick(current: readonly string[], id: string): string[] {
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (id === OWN_LOGIN) return [OWN_LOGIN];
  return [...current.filter((item) => item !== OWN_LOGIN), id];
}
