import type { OrgRole, PermissionSlug, WorkspaceRole } from "@minea/types";

const ORG_ADMIN_ROLES: OrgRole[] = ["owner", "admin"];

const ORG_PERMISSIONS: Record<OrgRole, Set<PermissionSlug>> = {
  owner: new Set([
    "org.settings.edit",
    "org.member.invite",
    "org.member.remove",
    "org.role.assign",
    "org.delete",
    "org.billing.manage",
    "org.transfer",
    "workspace.create",
  ]),
  admin: new Set([
    "org.settings.edit",
    "org.member.invite",
    "org.member.remove",
    "org.role.assign",
    "workspace.create",
  ]),
  member: new Set(),
};

const WORKSPACE_PERMISSIONS: Record<WorkspaceRole, Set<PermissionSlug>> = {
  admin: new Set([
    "workspace.settings.edit",
    "workspace.member.invite",
    "workspace.member.remove",
    "workspace.delete",
    "workspace.share.create",
    "object.create",
    "object.edit",
    "object.delete",
    "object.view",
  ]),
  member: new Set([
    "object.create",
    "object.edit",
    "object.delete",
    "object.view",
    "workspace.share.create",
  ]),
  viewer: new Set(["object.view", "workspace.share.create"]),
};

const SENSITIVE_PERMISSIONS: Set<PermissionSlug> = new Set([
  "org.member.invite",
  "org.role.assign",
  "org.delete",
  "org.billing.manage",
  "org.transfer",
  "workspace.member.invite",
]);

export function effectiveWorkspaceRole(
  orgRole: OrgRole | null | undefined,
  workspaceRole: WorkspaceRole | null | undefined
): WorkspaceRole | null {
  if (!orgRole) return workspaceRole ?? null;
  if (ORG_ADMIN_ROLES.includes(orgRole)) return "admin";
  return workspaceRole ?? null;
}

export function hasPermission(
  permission: PermissionSlug,
  {
    orgRole,
    workspaceRole,
    emailVerified = true,
  }: {
    orgRole?: OrgRole | null;
    workspaceRole?: WorkspaceRole | null;
    emailVerified?: boolean;
  }
): boolean {
  if (!orgRole) return false;
  if (SENSITIVE_PERMISSIONS.has(permission) && !emailVerified) return false;

  const permMeta = permission.startsWith("org.") || permission === "workspace.create" ? "org" : "workspace";

  if (permMeta === "org") {
    return ORG_PERMISSIONS[orgRole]?.has(permission) ?? false;
  }

  const effectiveWsRole = effectiveWorkspaceRole(orgRole, workspaceRole);
  if (!effectiveWsRole) return false;
  return WORKSPACE_PERMISSIONS[effectiveWsRole]?.has(permission) ?? false;
}

export function canViewRepository(ctx: {
  orgRole?: OrgRole | null;
  workspaceRole?: WorkspaceRole | null;
}): boolean {
  return hasPermission("object.view", ctx);
}

export function canEditRepository(ctx: {
  orgRole?: OrgRole | null;
  workspaceRole?: WorkspaceRole | null;
  emailVerified?: boolean;
}): boolean {
  return hasPermission("object.edit", ctx);
}

export function canManageOrg(ctx: {
  orgRole?: OrgRole | null;
  emailVerified?: boolean;
}): boolean {
  return hasPermission("org.settings.edit", ctx);
}

export function canManageWorkspace(ctx: {
  orgRole?: OrgRole | null;
  workspaceRole?: WorkspaceRole | null;
  emailVerified?: boolean;
}): boolean {
  return hasPermission("workspace.settings.edit", ctx);
}

export function isReadOnlyViewer(ctx: {
  orgRole?: OrgRole | null;
  workspaceRole?: WorkspaceRole | null;
}): boolean {
  const effective = effectiveWorkspaceRole(ctx.orgRole, ctx.workspaceRole);
  return effective === "viewer";
}
