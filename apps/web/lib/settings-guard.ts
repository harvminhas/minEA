import { canManageOrg } from "@/lib/permissions";
import { primaryViewPath } from "@/lib/views";
import type { OrgRole } from "@minea/types";

/**
 * Org settings sends members who can't manage the org to their workspace (Ask).
 *
 * Decide from the org this page loaded (its role comes with it), not from the app store's
 * activeOrg. The org layout copies the org into the store in its own effect, and React runs a
 * page's effects before its layout's. So on the render where the org and workspaces arrive
 * together (both cached, e.g. right after sign-in or clicking Org settings from Ask), the store
 * still had no role, the owner looked like a plain member, and was bounced back to Ask.
 */
export function settingsRedirectFor(
  orgSlug: string,
  org: { slug: string; role?: string | null } | undefined,
  workspaces: { slug: string }[] | undefined
): string | null {
  if (!org || !workspaces || org.slug !== orgSlug || !org.role) return null;
  if (canManageOrg({ orgRole: org.role as OrgRole })) return null;
  if (workspaces.length === 0) return null;
  const ws = workspaces.find((w) => w.slug === "default") ?? workspaces[0]!;
  return primaryViewPath(orgSlug, ws.slug);
}
