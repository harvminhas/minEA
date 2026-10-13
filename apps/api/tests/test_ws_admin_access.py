import re
from pathlib import Path

from app.services.authorization import AuthScope, _effective_role, _permission_meta

ROOT = Path(__file__).resolve().parents[1]
WS_SRC = (ROOT / "app/routers/workspaces.py").read_text()
SQL = (ROOT / "migrations/004_roles_permissions_limits.sql").read_text()
SCOPES = dict(re.findall(r"\('([a-z_.]+)',\s+'(org|workspace)'", SQL))

WS_ADMIN_ENDPOINTS = {
    "update_workspace": "workspace.settings.edit",
    "delete_workspace": "workspace.delete",
    "list_workspace_members": "workspace.settings.edit",
    "list_workspace_invites": "workspace.member.invite",
    "create_workspace_invite": "workspace.member.invite",
    "revoke_workspace_invite": "workspace.member.invite",
    "resend_workspace_invite": "workspace.member.invite",
    "change_workspace_member_role": "workspace.member.invite",
    "remove_workspace_member": "workspace.member.remove",
}


def _body(name: str) -> str:
    start = WS_SRC.index(f"async def {name}(")
    nxt = WS_SRC.find("\n@router.", start)
    return WS_SRC[start: nxt if nxt != -1 else None]


def test_workspace_settings_endpoints_use_workspace_scoped_permissions():
    for fn, perm in WS_ADMIN_ENDPOINTS.items():
        body = _body(fn)
        assert f'require_permission(db, "{perm}")' in body, fn
        assert "Depends(get_workspace_context)" in body, fn
        assert SCOPES[perm] == "workspace", perm
        assert "org_role" not in body, f"{fn} must not require an org role"


def test_org_member_who_is_workspace_admin_resolves_to_workspace_admin():
    _permission_meta.setdefault("workspace.settings.edit", "workspace")
    scope = AuthScope.__new__(AuthScope)
    object.__setattr__(scope, "org_role", "member")
    object.__setattr__(scope, "workspace_role", "admin")
    assert _effective_role(scope, "workspace.settings.edit") == ("workspace", "admin")


def test_plain_member_resolves_to_member_which_lacks_settings_edit():
    scope = AuthScope.__new__(AuthScope)
    object.__setattr__(scope, "org_role", "member")
    object.__setattr__(scope, "workspace_role", "member")
    assert _effective_role(scope, "workspace.settings.edit") == ("workspace", "member")
    member_grants = SQL[SQL.index("('member', 'workspace'"):] if "('member', 'workspace'" in SQL else ""
    assert "workspace.settings.edit" not in member_grants.split(";")[0]
