/**
 * Workspace admins who are only org members. Workspace settings live at a workspace-level route
 * (/orgs/{org}/workspaces/{ws}/settings) and the API gates it with workspace-scoped permissions
 * (workspace.settings.edit / member.* / delete), which a workspace admin holds. These helpers decide
 * where the "Workspace settings" links appear; the API still enforces every check.
 */
import type { OrgRole, WorkspaceRole } from "@minea/types";
import { hasPermission } from "@/lib/permissions";

export const WORKSPACE_SETTINGS_LABEL = "Workspace settings";

export function workspaceSettingsPath(orgSlug: string, workspaceSlug: string): string {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/settings`;
}

/** workspace.settings.edit: org owners/admins everywhere, workspace admins in their workspace. */
export function canEditWorkspaceSettings(
  orgRole: string | null | undefined,
  workspaceRole: string | null | undefined
): boolean {
  return hasPermission("workspace.settings.edit", {
    orgRole: (orgRole ?? null) as OrgRole | null,
    workspaceRole: (workspaceRole ?? null) as WorkspaceRole | null,
  });
}

/** Workspaces whose settings this user can open (list API returns the effective role per workspace). */
export function adminWorkspaces<T extends { slug: string; name: string; role?: string | null }>(
  workspaces: T[] | undefined,
  orgRole: string | null | undefined
): T[] {
  return (workspaces ?? [])
    .filter((w) => canEditWorkspaceSettings(orgRole, w.role))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The sidebar "settings" footer link: org admins get Org settings; a workspace admin who is only an
 * org member gets this workspace's settings (Org settings would only say "not an admin").
 */
export function sidebarSettingsLink(opts: {
  orgSlug: string | null | undefined;
  workspaceSlug: string | null | undefined;
  canManageOrg: boolean;
  canManageWorkspace: boolean;
}): { href: string; label: string } {
  const { orgSlug, workspaceSlug, canManageOrg, canManageWorkspace } = opts;
  if (!orgSlug) return { href: "/home", label: "Org settings" };
  if (!canManageOrg && canManageWorkspace && workspaceSlug)
    return { href: workspaceSettingsPath(orgSlug, workspaceSlug), label: WORKSPACE_SETTINGS_LABEL };
  return { href: `/orgs/${orgSlug}/settings`, label: "Org settings" };
}
