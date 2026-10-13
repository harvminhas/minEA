"""Org member management guardrails (pure, so they're unit-testable without a DB).

Rules (mirrored in apps/web/lib/member-actions.ts for the UI):
- Org roles are owner / admin / member (viewer is a workspace-level role only).
- Only owners can change, promote to, or remove owners; admins can't touch owners.
- The last owner can never be demoted or removed.
- You can't remove yourself from Members; use Leave org, which is refused only for the last owner.
Removal deletes memberships only: every record the user created keeps its created_by/updated_by,
because those foreign keys point at users.id, and the user row is never deleted.
"""
from __future__ import annotations

ORG_ROLES = ("owner", "admin", "member")


class GuardrailError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def check_role_change(*, actor_role: str, target_role: str, new_role: str, owner_count: int) -> None:
    if new_role not in ORG_ROLES:
        raise GuardrailError(400, "Role must be owner, admin or member")
    if new_role == target_role:
        return
    if actor_role != "owner" and (target_role == "owner" or new_role == "owner"):
        raise GuardrailError(403, "Only owners can change an owner or make someone an owner")
    if target_role == "owner" and owner_count <= 1:
        raise GuardrailError(400, "You can't demote the last owner. Make someone else an owner first.")


def check_removal(*, actor_role: str, is_self: bool, target_role: str, owner_count: int) -> None:
    if is_self:
        raise GuardrailError(400, "You can't remove yourself. Use Leave org instead.")
    if target_role == "owner":
        if actor_role != "owner":
            raise GuardrailError(403, "Admins can't remove an owner")
        if owner_count <= 1:
            raise GuardrailError(400, "You can't remove the last owner")


def check_leave(*, own_role: str, owner_count: int) -> None:
    if own_role == "owner" and owner_count <= 1:
        raise GuardrailError(
            400, "You're the only owner. Make someone else an owner before you leave the org."
        )


# --- Workspace members -------------------------------------------------------------------------
# Who may act is checked by the permission system: org owners/admins are implicit admins of every
# workspace, and workspace admins hold workspace.member.* for their own workspace. These rules only
# protect the workspace itself. "Admins" here means explicit workspace admin memberships.
WORKSPACE_ROLES = ("admin", "member", "viewer")
LAST_WS_ADMIN = "This is the workspace's last admin. Make someone else an admin first."


def check_ws_role_change(*, target_role: str, new_role: str, admin_count: int) -> None:
    if new_role not in WORKSPACE_ROLES:
        raise GuardrailError(400, "Role must be admin, member or viewer")
    if new_role != target_role and target_role == "admin" and admin_count <= 1:
        raise GuardrailError(400, LAST_WS_ADMIN)


def check_ws_removal(*, is_self: bool, target_role: str, admin_count: int) -> None:
    if is_self:
        raise GuardrailError(400, "You can't remove yourself. Use Leave workspace instead.")
    if target_role == "admin" and admin_count <= 1:
        raise GuardrailError(400, LAST_WS_ADMIN)


def check_ws_leave(*, own_role: str, admin_count: int) -> None:
    if own_role == "admin" and admin_count <= 1:
        raise GuardrailError(400, LAST_WS_ADMIN)
