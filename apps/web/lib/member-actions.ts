/** Member row actions in Org settings > Members. Mirrors apps/api/app/services/member_guardrails.py;
 * the API is the source of truth, this only decides what the UI offers. */
export const ORG_ROLE_OPTIONS = ["owner", "admin", "member"] as const;
export type OrgRoleOption = (typeof ORG_ROLE_OPTIONS)[number];

export interface MemberActions {
  /** Roles the actor may pick for this row (includes the current role). Empty = no role control. */
  roles: string[];
  canRemove: boolean;
  canLeave: boolean;
  /** Why role/remove is unavailable, shown as a tooltip/hint. */
  reason: string | null;
}

export function memberActions(opts: {
  actorRole: string | null | undefined;
  isSelf: boolean;
  targetRole: string;
  ownerCount: number;
}): MemberActions {
  const { actorRole, isSelf, targetRole, ownerCount } = opts;
  const manager = actorRole === "owner" || actorRole === "admin";
  const lastOwner = targetRole === "owner" && ownerCount <= 1;
  if (isSelf) {
    return {
      roles: [],
      canRemove: false,
      canLeave: !(targetRole === "owner" && ownerCount <= 1),
      reason: lastOwner ? "You're the only owner. Make someone else an owner before you leave." : null,
    };
  }
  if (!manager) return { roles: [], canRemove: false, canLeave: false, reason: null };
  if (targetRole === "owner" && actorRole !== "owner") {
    return { roles: [], canRemove: false, canLeave: false, reason: "Only owners can change an owner" };
  }
  if (lastOwner) {
    return { roles: [], canRemove: false, canLeave: false, reason: "The last owner can't be demoted or removed" };
  }
  const roles = ORG_ROLE_OPTIONS.filter((r) => r !== "owner" || actorRole === "owner" || r === targetRole);
  return { roles: [...roles], canRemove: true, canLeave: false, reason: null };
}

export function countOwners(members: { role: string }[] | undefined): number {
  return (members ?? []).filter((m) => m.role === "owner").length;
}

// --- Workspace members (mirrors check_ws_* in member_guardrails.py) ---------------------------
export const WORKSPACE_ROLE_OPTIONS = ["admin", "member", "viewer"] as const;
export const LAST_WS_ADMIN_REASON = "This is the workspace's last admin. Make someone else an admin first.";

/** canManage = org owner/admin or workspace admin (the API's workspace.member.* permissions). */
export function workspaceMemberActions(opts: {
  canManage: boolean;
  isSelf: boolean;
  targetRole: string;
  adminCount: number;
}): MemberActions {
  const { canManage, isSelf, targetRole, adminCount } = opts;
  const lastAdmin = targetRole === "admin" && adminCount <= 1;
  if (isSelf) {
    return {
      // You may change your own role unless you're the last admin.
      roles: canManage && !lastAdmin ? [...WORKSPACE_ROLE_OPTIONS] : [],
      canRemove: false,
      canLeave: !lastAdmin,
      reason: lastAdmin ? LAST_WS_ADMIN_REASON : null,
    };
  }
  if (!canManage) return { roles: [], canRemove: false, canLeave: false, reason: null };
  if (lastAdmin) return { roles: [], canRemove: false, canLeave: false, reason: LAST_WS_ADMIN_REASON };
  return { roles: [...WORKSPACE_ROLE_OPTIONS], canRemove: true, canLeave: false, reason: null };
}

export function countAdmins(members: { role: string }[] | undefined): number {
  return (members ?? []).filter((m) => m.role === "admin").length;
}

export const WS_REMOVE_COPY =
  "They lose access to this workspace but stay in the org. Everything they created stays, and an editor licence is freed if this was their only editing role.";
