/**
 * Roles must never be served from a stale cache. The API resolves the caller's org/workspace role
 * from the DB on every request; the web app used to keep ["org", slug] (which carries `role`) for
 * 60s and never refetch it while TopNav / the org layout stayed mounted, so a member promoted to
 * Admin kept seeing "You're not an admin" until a full reload. These options and helpers keep the
 * membership queries fresh: refetched on mount, on window focus, on navigation, and after any 403.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const MEMBERSHIP_QUERY = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
} as const;

const MEMBERSHIP_ROOTS = new Set(["org", "orgs", "workspace", "workspaces"]);

/** Queries that carry the caller's role: the org, the org list, the workspace, workspace lists. */
export function isMembershipKey(key: QueryKey | undefined): boolean {
  return Array.isArray(key) && typeof key[0] === "string" && MEMBERSHIP_ROOTS.has(key[0]);
}

/** apiFetch errors start with the HTTP status ("403 Not a member… (/orgs/x)"). */
export function isForbidden(err: unknown): boolean {
  return err instanceof Error && /^403\b/.test(err.message);
}

/** Refetch everything that carries a role (optionally only for one org). */
export function invalidateMembership(qc: QueryClient, orgSlug?: string | null): Promise<void> {
  return qc.invalidateQueries({
    predicate: (q) => {
      if (!isMembershipKey(q.queryKey)) return false;
      if (!orgSlug || q.queryKey[0] === "orgs") return true;
      return q.queryKey[1] === orgSlug;
    },
  });
}

/**
 * A 403 anywhere means our idea of the role may be out of date: refetch the role queries.
 * Not when the failing query is itself a role query (that would refetch it in a loop).
 */
export function onForbiddenRefreshMembership(qc: QueryClient, err: unknown, failingKey?: QueryKey): boolean {
  if (!isForbidden(err) || isMembershipKey(failingKey)) return false;
  void invalidateMembership(qc);
  return true;
}
