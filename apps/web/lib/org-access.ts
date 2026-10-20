/**
 * Which org am I in, and what can I do there? Pure helpers for the org switcher, the avatar
 * menu and the Org settings page. The API still enforces every permission server-side.
 */
import { isModelLayoutViewPath, primaryViewPath } from "@/lib/views";

export type RoleName = "owner" | "admin" | "member" | "viewer";

export const ROLE_LABELS: Record<RoleName, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Member";
  return ROLE_LABELS[role as RoleName] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

/** Only owners and admins can open Org settings (matches the API's org.settings.edit). */
export function isOrgAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Org settings for someone who can't manage this org: show a message instead of the page. */
export function notAdminOf(org: { role?: string | null } | undefined): boolean {
  return !!org?.role && !isOrgAdminRole(org.role);
}

/** Other orgs where this user is an owner or admin (links on the not-admin message). */
export function otherAdminOrgs<T extends { slug: string; role?: string | null; name: string }>(
  orgs: T[] | undefined,
  currentSlug: string
): T[] {
  return (orgs ?? [])
    .filter((o) => o.slug !== currentSlug && isOrgAdminRole(o.role))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The workspace an org opens on: "default" if there is one, else the first. */
export function firstWorkspace<T extends { slug: string }>(workspaces: T[] | undefined): T | undefined {
  if (!workspaces?.length) return undefined;
  return workspaces.find((w) => w.slug === "default") ?? workspaces[0];
}

/** Where "switch to this org" lands: its first workspace's Ask page. */
export function orgLandingPath(orgSlug: string, workspaces: { slug: string }[] | undefined): string {
  const ws = firstWorkspace(workspaces);
  // No workspace shared yet: a page that says so, not Org settings (members can't use it).
  return ws ? primaryViewPath(orgSlug, ws.slug) : `/orgs/${orgSlug}/no-workspace`;
}

export function orgSettingsLabel(orgName: string | null | undefined): string {
  return orgName ? `Org settings · ${orgName}` : "Org settings";
}

/** The org lookup failed: HTTP status from apiFetch's "403 detail (path)" message, if any. */
export function orgLoadErrorStatus(error: unknown): number | null {
  const status = Number(error instanceof Error ? error.message.slice(0, 3) : NaN);
  return Number.isFinite(status) && status >= 100 ? status : null;
}

export function orgLoadErrorMessage(error: unknown): string {
  const status = orgLoadErrorStatus(error);
  if (status === 403 || status === 404) {
    return "This organisation isn't available to your account. You may not be a member of it.";
  }
  return "We couldn't load this organisation. Check your connection and try again.";
}

export type TopNavTab = "ask" | "model" | "views" | "reports";

/** Which top-nav tab is highlighted. Org-level pages (e.g. Org settings) highlight none. */
export function activeTopNavTab(pathname: string): TopNavTab | null {
  if (!/^\/orgs\/[^/]+\/workspaces\/[^/]+/.test(pathname)) return null;
  if (/\/workspaces\/new\/?$/.test(pathname)) return null;
  if (/\/workspaces\/[^/]+\/settings(\/|$)/.test(pathname)) return null;
  if (pathname.includes("/ask")) return "ask";
  if (pathname.includes("/reports")) return "reports";
  if (pathname.includes("/views") && !isModelLayoutViewPath(pathname)) return "views";
  return "model";
}
