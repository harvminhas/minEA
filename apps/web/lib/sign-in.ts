/**
 * Sign-in (single sign-on) links. One relationship type, authenticates_via, from an app or
 * platform to the app or platform people sign in through (usually Microsoft 365).
 * "Own login (no SSO)" is a property on the app itself (properties.sign_in = "own_login"),
 * so a confirmed no-SSO app is distinct from one where nothing is recorded.
 */

import { TOOL_CATALOG, normalizeTerm, type ToolRecord } from "@/lib/setup/match-tools";

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

type CatalogObject = { id: string; type: string; name: string; status?: string | null; properties?: Record<string, unknown> | null };

/** The catalog tool for a record: its catalog_tool, else a name equal to (or starting with) a catalog name or alias. */
export function catalogToolFor(object: { name: string; properties?: Record<string, unknown> | null }): ToolRecord | null {
  const stored = object.properties?.catalog_tool;
  const toolTerm = typeof stored === "string" ? normalizeTerm(stored) : "";
  const name = normalizeTerm(object.name ?? "");
  const names = (tool: ToolRecord) => [tool.name, ...tool.aliases].map(normalizeTerm).filter(Boolean);
  if (toolTerm) {
    const byTool = TOOL_CATALOG.find((tool) => names(tool).includes(toolTerm));
    if (byTool) return byTool;
  }
  return TOOL_CATALOG.find((tool) => names(tool).some((term) => name === term || name.startsWith(`${term} `))) ?? null;
}

export function isIdentityProvider(object: { name: string; properties?: Record<string, unknown> | null }): boolean {
  return Boolean(catalogToolFor(object)?.idp);
}

export const SIGN_IN_HINT = "Usually signs in with your identity provider";

/**
 * Details hint for an empty Signs in with on a tool that usually uses single sign-on.
 * provider is set when exactly one record is the obvious pick: the only one others sign in with,
 * or, when nothing is linked yet, the only identity provider in the workspace.
 */
export function signInSuggestion(
  object: CatalogObject,
  objects: readonly CatalogObject[],
  relationships: readonly { type: string; from_object_id: string; to_object_id: string }[]
): { hint: string; provider: { id: string; name: string } | null } | null {
  if (isOwnLogin(object.properties)) return null;
  if (relationships.some((rel) => rel.type === SIGN_IN_EDGE && rel.from_object_id === object.id)) return null;
  if (!catalogToolFor(object)?.ssoUsual) return null;
  const pickable = objects.filter(
    (item) => item.id !== object.id && (SIGN_IN_TARGETS as readonly string[]).includes(item.type) && isSignInCandidate(item)
  );
  const counts = signInCounts(relationships);
  const used = pickable.filter((item) => (counts.get(item.id) ?? 0) > 0);
  const pool = used.length ? used : pickable.filter(isIdentityProvider);
  const only = pool.length === 1 ? pool[0]! : null;
  return { hint: SIGN_IN_HINT, provider: only ? { id: only.id, name: only.name } : null };
}
