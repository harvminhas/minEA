"""Licence cap: only new editors are blocked; existing editors and reads are never affected."""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import billing as billing_router
from app.services import licences as lic

A, B, C = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


def run(coro):
    return asyncio.run(coro)


def test_invite_grants_licence_rules():
    assert lic.invite_grants_licence(workspace_id=None, role="admin")
    assert not lic.invite_grants_licence(workspace_id=None, role="member")  # org member, no workspace
    ws = uuid.uuid4()
    assert lic.invite_grants_licence(workspace_id=ws, role="admin")
    assert lic.invite_grants_licence(workspace_id=ws, role="member")
    assert not lic.invite_grants_licence(workspace_id=ws, role="viewer")


def test_usage_dedupes_holders_and_pending_invites():
    i1, i2, i3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    usage = lic.build_usage(
        [(A, "Owner@x.com"), (B, "b@x.com"), (B, "b@x.com")],  # B is org admin and workspace member
        [(i1, "owner@x.com"), (i2, "new@x.com"), (i3, "NEW@x.com")],
    )
    assert usage.holder_ids == {A, B}
    assert usage.pending_emails == {"new@x.com"}
    assert usage.used == 3


def test_excluding_the_invite_being_accepted():
    i1 = uuid.uuid4()
    usage = lic.build_usage([(A, "a@x.com")], [(i1, "c@x.com")], exclude_invite_id=i1)
    assert usage.used == 1
    assert lic.needs_new_licence(usage, user_id=C, email="c@x.com")


def test_needs_new_licence():
    usage = lic.build_usage([(A, "a@x.com")], [(uuid.uuid4(), "p@x.com")])
    assert not lic.needs_new_licence(usage, user_id=A)
    assert not lic.needs_new_licence(usage, email="A@x.com")
    assert not lic.needs_new_licence(usage, email="p@x.com")
    assert lic.needs_new_licence(usage, email="z@x.com")


def _patch(monkeypatch, cap, holders, pending=()):
    async def fake_cap(db, org_id):
        return cap

    async def fake_usage(db, org_id, *, exclude_invite_id=None):
        return lic.build_usage(holders, pending, exclude_invite_id=exclude_invite_id)

    monkeypatch.setattr(lic, "licence_cap", fake_cap)
    monkeypatch.setattr(lic, "load_usage", fake_usage)


def test_no_cap_means_unlimited_for_legacy(monkeypatch):
    _patch(monkeypatch, None, [(uuid.uuid4(), f"u{i}@x.com") for i in range(40)])
    run(lic.require_licence(None, uuid.uuid4(), email="another@x.com"))


def test_new_editor_allowed_while_room(monkeypatch):
    _patch(monkeypatch, 5, [(A, "a@x.com"), (B, "b@x.com")])
    run(lic.require_licence(None, uuid.uuid4(), email="c@x.com"))


def test_new_editor_blocked_at_cap(monkeypatch):
    _patch(monkeypatch, 1, [(A, "a@x.com")])
    with pytest.raises(HTTPException) as caught:
        run(lic.require_licence(None, uuid.uuid4(), email="c@x.com"))
    assert caught.value.status_code == 403
    assert caught.value.detail["code"] == "licence_limit"
    assert caught.value.detail["max"] == 1


def test_over_cap_after_downgrade_existing_editors_unaffected(monkeypatch):
    # Team (5 editors) cancelled -> Free cap 1. Existing editors are not re-checked;
    # promoting someone who already holds a licence is allowed, adding a new one is not.
    holders = [(uuid.uuid4(), f"e{i}@x.com") for i in range(4)] + [(A, "a@x.com")]
    _patch(monkeypatch, 1, holders)
    run(lic.require_licence(None, uuid.uuid4(), user_id=A, email="a@x.com"))
    with pytest.raises(HTTPException):
        run(lic.require_licence(None, uuid.uuid4(), user_id=C, email="c@x.com"))


def test_accepting_an_invite_that_was_counted_fits(monkeypatch):
    invite_id = uuid.uuid4()
    _patch(monkeypatch, 2, [(A, "a@x.com")], [(invite_id, "c@x.com")])
    run(lic.require_licence(None, uuid.uuid4(), user_id=C, email="c@x.com", exclude_invite_id=invite_id))


def test_accepting_an_invite_after_downgrade_is_blocked(monkeypatch):
    invite_id = uuid.uuid4()
    _patch(monkeypatch, 1, [(A, "a@x.com")], [(invite_id, "c@x.com")])
    with pytest.raises(HTTPException):
        run(lic.require_licence(None, uuid.uuid4(), user_id=C, email="c@x.com", exclude_invite_id=invite_id))


def _ctx(role, verified=True):
    return SimpleNamespace(org_role=role, email_verified=verified)


@pytest.mark.parametrize("role,verified,ok", [
    ("owner", True, True), ("admin", True, True), ("member", True, False), ("owner", False, False),
])
def test_only_verified_owner_or_admin_manage_billing(role, verified, ok):
    assert billing_router.can_manage_billing(_ctx(role, verified)) is ok
    if ok:
        billing_router.require_billing_manager(_ctx(role, verified))
    else:
        with pytest.raises(HTTPException) as caught:
            billing_router.require_billing_manager(_ctx(role, verified))
        assert caught.value.status_code == 403


@pytest.mark.parametrize("plan,sub,expected", [
    ("free", None, "free"),
    ("business", None, "business_legacy"),
    ("solo", None, "business_legacy"),
    ("business", "sub_1", "business"),
    ("team", "sub_1", "team"),
    ("starter", "sub_1", "starter"),
])
def test_display_plan_grandfathering(plan, sub, expected):
    assert billing_router.display_plan(plan, sub) == expected
