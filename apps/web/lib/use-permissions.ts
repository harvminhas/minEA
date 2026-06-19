"use client";

import { useAuth } from "@/lib/auth-context";
import { useAccess } from "@/lib/access-context";
import type { AccessMode } from "@/lib/access-context";
import { useAppStore } from "@/lib/store";
import { useShareSession } from "@/lib/share-context";
import {
  canEditRepository,
  canManageOrg,
  canManageWorkspace,
  canViewRepository,
  effectiveWorkspaceRole,
  hasPermission,
  isReadOnlyViewer,
} from "@/lib/permissions";
import type { OrgRole, PermissionSlug, WorkspaceRole } from "@minea/types";
import { planAllowsInvites } from "@/lib/plan-features";

export function usePermissions() {
  const { user } = useAuth();
  const { activeOrg, activeWorkspace } = useAppStore();
  const shareSession = useShareSession();
  const access = useAccess();

  const orgRole = activeOrg?.role as OrgRole | undefined;
  const workspaceRole = activeWorkspace?.role as WorkspaceRole | undefined;
  const emailVerified = user ? !user.requiresEmailVerification : false;
  const effectiveRole = effectiveWorkspaceRole(orgRole, workspaceRole);

  const ctx = { orgRole, workspaceRole, emailVerified };
  const viewerByRole = isReadOnlyViewer(ctx);
  const isReadOnly = access.isReadOnly || !!shareSession || viewerByRole;

  const mode: AccessMode = shareSession || access.mode === "share"
    ? "share"
    : access.mode !== "full"
      ? access.mode
      : viewerByRole
        ? "read"
        : "full";

  const canWrite = !isReadOnly;

  return {
    orgRole,
    workspaceRole,
    effectiveRole,
    emailVerified,
    mode,
    isReadOnly,
    can: (permission: PermissionSlug) => canWrite && hasPermission(permission, ctx),
    canView: canViewRepository(ctx) || !!shareSession,
    canEdit: canWrite && canEditRepository(ctx),
    canCreate: canWrite && hasPermission("object.create", ctx),
    canDelete: canWrite && hasPermission("object.delete", ctx),
    canManageOrg: canWrite && canManageOrg(ctx),
    canManageWorkspace: canWrite && canManageWorkspace(ctx),
    canInviteOrgMembers:
      canWrite && planAllowsInvites(activeOrg?.plan) && hasPermission("org.member.invite", ctx),
    canInviteWorkspaceMembers:
      canWrite && planAllowsInvites(activeOrg?.plan) && hasPermission("workspace.member.invite", ctx),
    canManageBilling: hasPermission("org.billing.manage", ctx),
    canDeleteOrg: hasPermission("org.delete", ctx),
    canTransferOwnership: hasPermission("org.transfer", ctx),
    canCreateWorkspace: hasPermission("workspace.create", ctx),
    canShare: hasPermission("workspace.share.create", ctx),
    isViewer: viewerByRole,
    isOwner: orgRole === "owner",
    isOrgAdmin: orgRole === "owner" || orgRole === "admin",
  };
}
