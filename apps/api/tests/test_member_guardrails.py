import re
from pathlib import Path

import pytest

from app.services.member_guardrails import GuardrailError, check_leave, check_removal, check_role_change

ROOT = Path(__file__).resolve().parents[1]


def _err(fn, **kw) -> GuardrailError:
    with pytest.raises(GuardrailError) as e:
        fn(**kw)
    return e.value


def test_cannot_demote_last_owner():
    e = _err(check_role_change, actor_role="owner", target_role="owner", new_role="admin", owner_count=1)
    assert e.status_code == 400 and "last owner" in e.detail
    check_role_change(actor_role="owner", target_role="owner", new_role="admin", owner_count=2)


def test_cannot_remove_last_owner():
    e = _err(check_removal, actor_role="owner", is_self=False, target_role="owner", owner_count=1)
    assert e.status_code == 400
    check_removal(actor_role="owner", is_self=False, target_role="owner", owner_count=2)


def test_admins_cannot_change_or_remove_or_create_owners():
    assert _err(check_role_change, actor_role="admin", target_role="owner", new_role="member", owner_count=2).status_code == 403
    assert _err(check_role_change, actor_role="admin", target_role="member", new_role="owner", owner_count=1).status_code == 403
    assert _err(check_removal, actor_role="admin", is_self=False, target_role="owner", owner_count=2).status_code == 403


def test_admins_manage_admins_and_members():
    check_role_change(actor_role="admin", target_role="member", new_role="admin", owner_count=1)
    check_role_change(actor_role="admin", target_role="admin", new_role="member", owner_count=1)
    check_removal(actor_role="admin", is_self=False, target_role="member", owner_count=1)
    check_role_change(actor_role="owner", target_role="member", new_role="owner", owner_count=1)


def test_unknown_role_rejected():
    assert _err(check_role_change, actor_role="owner", target_role="member", new_role="viewer", owner_count=1).status_code == 400


def test_cannot_remove_yourself_use_leave_and_last_owner_cannot_leave():
    assert "Leave org" in _err(check_removal, actor_role="owner", is_self=True, target_role="owner", owner_count=2).detail
    assert _err(check_leave, own_role="owner", owner_count=1).status_code == 400
    check_leave(own_role="owner", owner_count=2)
    check_leave(own_role="member", owner_count=1)
    check_leave(own_role="admin", owner_count=1)


def test_routes_use_guardrails_and_removal_only_drops_memberships():
    src = (ROOT / "app/routers/orgs.py").read_text()
    for name in ("check_role_change", "check_removal", "check_leave"):
        assert f"_guard(\n        {name}" in src or f"_guard({name}" in src
    assert '@router.post("/{org_slug}/leave"' in src
    assert '@router.post("/{org_slug}/invites/{invite_id}/resend"' in src
    drop = src[src.index("async def _drop_membership"): src.index("def _invite_url")]
    assert "db.delete(ws_mem)" in drop and "db.delete(membership)" in drop
    assert "User" not in drop.replace("WorkspaceMembership", "")
    assert not re.search(r"delete\(\s*(User|ObjectRecord|Obj)", src)


def test_records_reference_users_not_memberships_so_they_survive_removal():
    models = "\n".join(p.read_text() for p in (ROOT / "app/models").glob("*.py"))
    assert 'ForeignKey("org_memberships' not in models
    assert 'ForeignKey("workspace_memberships' not in models
