from pathlib import Path

import pytest

from app.services.member_guardrails import (
    GuardrailError,
    check_ws_leave,
    check_ws_removal,
    check_ws_role_change,
)

SRC = (Path(__file__).resolve().parents[1] / "app/routers/workspaces.py").read_text()


def _status(fn, **kw) -> int:
    with pytest.raises(GuardrailError) as e:
        fn(**kw)
    return e.value.status_code


def test_last_workspace_admin_cannot_be_demoted():
    assert _status(check_ws_role_change, target_role="admin", new_role="member", admin_count=1) == 400
    check_ws_role_change(target_role="admin", new_role="viewer", admin_count=2)
    check_ws_role_change(target_role="admin", new_role="admin", admin_count=1)


def test_last_workspace_admin_cannot_be_removed():
    assert _status(check_ws_removal, is_self=False, target_role="admin", admin_count=1) == 400
    check_ws_removal(is_self=False, target_role="admin", admin_count=2)
    check_ws_removal(is_self=False, target_role="viewer", admin_count=1)


def test_roles_are_admin_member_viewer():
    for r in ("admin", "member", "viewer"):
        check_ws_role_change(target_role="viewer", new_role=r, admin_count=1)
    assert _status(check_ws_role_change, target_role="member", new_role="owner", admin_count=1) == 400


def test_remove_self_is_refused_use_leave_last_admin_cannot_leave():
    assert _status(check_ws_removal, is_self=True, target_role="member", admin_count=1) == 400
    check_ws_leave(own_role="member", admin_count=1)
    check_ws_leave(own_role="admin", admin_count=2)
    assert _status(check_ws_leave, own_role="admin", admin_count=1) == 400


def test_routes_use_workspace_permissions_so_org_admins_and_ws_admins_can_manage():
    # Org owners/admins resolve to workspace admin for workspace-scoped permissions.
    auth = (Path(__file__).resolve().parents[1] / "app/services/authorization.py").read_text()
    assert 'if scope.org_role in ORG_ADMIN_ROLES:\n        return ("workspace", "admin")' in auth
    role = SRC[SRC.index("async def change_workspace_member_role"):SRC.index("async def remove_workspace_member")]
    assert 'require_permission(db, "workspace.member.invite")' in role and "check_ws_role_change" in role
    rm = SRC[SRC.index("async def remove_workspace_member"):SRC.index("async def leave_workspace")]
    assert 'require_permission(db, "workspace.member.remove")' in rm and "check_ws_removal" in rm
    assert '@router.post("/{workspace_slug}/leave"' in SRC
    assert '@router.post("/{workspace_slug}/invites/{invite_id}/resend"' in SRC


def test_removal_only_deletes_the_workspace_membership():
    rm = SRC[SRC.index("async def remove_workspace_member"):SRC.index('@router.post("/{workspace_slug}/leave"')]
    assert rm.count("db.delete(") == 1 and "db.delete(membership)" in rm
