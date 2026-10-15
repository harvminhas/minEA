"""Platform admin Erase user: safeguards (pure) and, against a real migrated Postgres when
ERASE_TEST_DATABASE_URL is set, that only the right rows go and other people's data is untouched."""
import asyncio
import os
import uuid

import pytest

from app.services import tool_catalog as tc
from app.services import user_erase as ue


# ── superuser ───────────────────────────────────────────────────────────────

def test_superuser_defaults_to_harv_and_env_replaces_it(monkeypatch):
    monkeypatch.delenv("PLATFORM_ADMIN_EMAILS", raising=False)
    assert tc.is_platform_admin("HarvMinhas@gmail.com", True)
    assert not tc.is_platform_admin("harvminhas@gmail.com", False)  # verified email still required
    assert not tc.is_platform_admin("someone@example.com", True)
    monkeypatch.setenv("PLATFORM_ADMIN_EMAILS", "  ")
    assert tc.is_platform_admin("harvminhas@gmail.com", True)
    monkeypatch.setenv("PLATFORM_ADMIN_EMAILS", "ops@example.com")
    assert not tc.is_platform_admin("harvminhas@gmail.com", True)
    assert tc.is_platform_admin("ops@example.com", True)


def test_every_admin_endpoint_depends_on_the_superuser_check():
    from app.routers import platform_admin, platform_catalog

    for route in platform_admin.router.routes:
        deps = [d.call for d in route.dependant.dependencies]
        assert platform_catalog.require_platform_admin in deps, route.path


# ── rules ───────────────────────────────────────────────────────────────────

def org(**kw):
    base = dict(id=str(uuid.uuid4()), slug="o", name="O", plan="free", role="owner", members=1, other_admins=0, subscription=False)
    return ue.decide(ue.OrgPlan(**{**base, **kw}))


def test_decide_delete_leave_block():
    assert org(members=1).action == "delete"
    assert org(members=3, role="member").action == "leave"
    assert org(members=3, role=None).action == "leave"
    assert org(members=3, role="owner", other_admins=1).action == "leave"
    assert org(members=3, role="owner", other_admins=0).action == "blocked"
    assert org(members=2, role="admin", other_admins=0).action == "blocked"


def plan_for(email="t@example.com", orgs=()):
    plan = ue.ErasePlan(user={"id": str(uuid.uuid4()), "email": email})
    plan.orgs = list(orgs)
    plan.blockers = [o.reason for o in orgs if o.action == "blocked"]
    plan.needs_subscription_ack = any(o.action == "delete" and o.subscription for o in orgs)
    return plan


def check(plan, confirm="t@example.com", admin="harvminhas@gmail.com", ack=False):
    ue.check_request(plan, admin_email=admin, confirm_email=confirm, acknowledge_subscriptions=ack)


def code_of(fn):
    with pytest.raises(ue.EraseError) as err:
        fn()
    return err.value.code


def test_safeguards(monkeypatch):
    monkeypatch.delenv("PLATFORM_ADMIN_EMAILS", raising=False)
    check(plan_for())  # ok
    check(plan_for(), confirm="  T@Example.com ")  # case/space-insensitive, but the whole address
    assert code_of(lambda: check(plan_for(), confirm="t@example")) == "confirm_mismatch"
    assert code_of(lambda: check(plan_for(), confirm="")) == "confirm_mismatch"
    assert code_of(lambda: check(plan_for("harvminhas@gmail.com"), confirm="harvminhas@gmail.com")) == "self"
    monkeypatch.setenv("PLATFORM_ADMIN_EMAILS", "harvminhas@gmail.com,ops@example.com")
    assert code_of(lambda: check(plan_for("ops@example.com"), confirm="ops@example.com")) == "platform_admin"
    assert code_of(lambda: check(plan_for(orgs=[org(members=2, other_admins=0)]))) == "blocked"
    paid = [org(members=1, subscription=True)]
    assert code_of(lambda: check(plan_for(orgs=paid))) == "subscription"
    check(plan_for(orgs=paid), ack=True)
    # A subscription on an org the user only leaves needs no acknowledgement.
    check(plan_for(orgs=[org(members=3, role="member", subscription=True)]))


# ── real Postgres ───────────────────────────────────────────────────────────

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


async def _seed(conn):
    from sqlalchemy import text

    ids = {k: uuid.uuid4() for k in ("t", "b", "solo", "shared", "ws_solo", "ws_shared", "o1", "o2", "o3", "ob")}
    tag = uuid.uuid4().hex[:8]
    q = lambda sql, **p: conn.execute(text(sql), p)
    await q("INSERT INTO users (id, firebase_uid, email, full_name) VALUES (:t, :tu, :te, 'Target'), (:b, :bu, :be, 'Bea')",
            t=ids["t"], tu="fb-t-" + tag, te=f"target-{tag}@example.com", b=ids["b"], bu="fb-b-" + tag, be=f"bea-{tag}@example.com")
    await q("INSERT INTO orgs (id, name, slug) VALUES (:a, 'Solo', :sa), (:b, 'Shared', :sb)", a=ids["solo"], sa="solo-" + tag, b=ids["shared"], sb="shared-" + tag)
    await q("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:t, :solo, 'owner'), (:t, :shared, 'member'), (:b, :shared, 'owner')", **ids)
    await q("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:ws_solo, :solo, 'W', 'default'), (:ws_shared, :shared, 'W', 'default')", **ids)
    await q("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (:t, :ws_solo, 'admin'), (:t, :ws_shared, 'member'), (:b, :ws_shared, 'admin')", **ids)
    await q("""INSERT INTO objects (id, workspace_id, org_id, type, name, properties, created_by) VALUES
            (:o1, :ws_solo, :solo, 'application', 'Solo app', '{}', :t),
            (:o2, :ws_solo, :solo, 'cloud_service', 'Solo tenant', '{}', :t),
            (:o3, :ws_shared, :shared, 'application', 'Made by target in shared', '{}', :t),
            (:ob, :ws_shared, :shared, 'application', 'Bea app', '{}', :b)""", **ids)
    await q("""INSERT INTO relationships (workspace_id, org_id, type, from_object_id, from_type, to_object_id, to_type) VALUES
            (:ws_solo, :solo, 'runs_on', :o1, 'application', :o2, 'cloud_service'),
            (:ws_shared, :shared, 'integrates_with', :o3, 'application', :ob, 'application')""", **ids)
    await q("""INSERT INTO change_log (workspace_id, org_id, object_id, object_type, action, diff, performed_by) VALUES
            (:ws_solo, :solo, :o1, 'application', 'created', '{}', :t),
            (:ws_shared, :shared, :o3, 'application', 'created', '{}', :t),
            (:ws_shared, :shared, :ob, 'application', 'created', '{}', :b)""", **ids)
    return ids, tag


def _run(coro_fn):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    async def go():
        engine = create_async_engine(DB_URL)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                return await coro_fn(db)
        finally:
            await engine.dispose()

    return asyncio.run(go())


@pg
def test_erase_deletes_solo_org_and_leaves_shared_org_intact(monkeypatch):
    from sqlalchemy import text

    monkeypatch.delenv("PLATFORM_ADMIN_EMAILS", raising=False)

    async def scenario(db):
        ids, tag = await _seed(db)
        await db.commit()
        email = f"target-{tag}@example.com"
        listed = await ue.list_users(db, q=f"target-{tag}")
        assert [u["email"] for u in listed] == [email]
        assert sorted((o["name"], o["role"]) for o in listed[0]["orgs"]) == [("Shared", "member"), ("Solo", "owner")]
        assert listed[0]["objects_created"] == 3 and listed[0]["last_active"]
        await db.rollback()
        preview = (await ue.plan_erase(db, ids["t"])).as_dict()
        await db.rollback()
        actions = {o["name"]: o["action"] for o in preview["orgs"]}
        assert actions == {"Shared": "leave", "Solo": "delete"}
        assert preview["counts"]["objects_deleted"] == 2 and preview["counts"]["relationships_deleted"] == 1
        with pytest.raises(ue.EraseError):
            await ue.execute_erase(db, ids["t"], admin_email="harvminhas@gmail.com", admin_uid="x", confirm_email="target@", acknowledge_subscriptions=False)
        assert (await db.execute(text("SELECT count(*) FROM users WHERE id = :t"), ids)).scalar() == 1  # nothing changed
        out = await ue.execute_erase(db, ids["t"], admin_email="harvminhas@gmail.com", admin_uid="admin-uid", confirm_email=email, acknowledge_subscriptions=False)
        assert out["counts"]["orgs_deleted"] == 1
        one = lambda sql: db.execute(text(sql), {k: v for k, v in ids.items()})
        assert (await one("SELECT count(*) FROM users WHERE id = :t")).scalar() == 0
        assert (await one("SELECT count(*) FROM orgs WHERE id = :solo")).scalar() == 0
        assert (await one("SELECT count(*) FROM objects WHERE org_id = :solo")).scalar() == 0
        assert (await one("SELECT count(*) FROM change_log WHERE org_id = :solo")).scalar() == 0
        # Shared org: Bea, her membership, her object, the object the target made, the link and history all stay.
        assert (await one("SELECT count(*) FROM users WHERE id = :b")).scalar() == 1
        assert (await one("SELECT count(*) FROM org_memberships WHERE org_id = :shared")).scalar() == 1
        assert (await one("SELECT count(*) FROM objects WHERE org_id = :shared")).scalar() == 2
        assert (await one("SELECT created_by FROM objects WHERE id = :o3")).scalar() is None
        assert (await one("SELECT created_by FROM objects WHERE id = :ob")).scalar() == ids["b"]
        assert (await one("SELECT count(*) FROM relationships WHERE org_id = :shared")).scalar() == 1
        assert (await one("SELECT count(*) FROM change_log WHERE org_id = :shared")).scalar() == 2
        assert (await one("SELECT count(*) FROM change_log WHERE performed_by = :b")).scalar() == 1
        audit = (await db.execute(text("SELECT erased_by_email, counts FROM platform_erasures WHERE erased_user_id = :t"), ids)).one()
        assert audit[0] == "harvminhas@gmail.com" and audit[1]["objects_deleted"] == 2
        # cleanup the shared org + Bea
        await db.execute(text("DELETE FROM orgs WHERE id = :shared"), ids)
        await db.execute(text("DELETE FROM users WHERE id = :b"), ids)
        await db.commit()

    _run(scenario)


@pg
def test_sole_admin_of_shared_org_is_blocked_and_nothing_changes(monkeypatch):
    from sqlalchemy import text

    async def scenario(db):
        ids, tag = await _seed(db)
        # Target becomes the only owner of Shared (Bea demoted to member).
        await db.execute(text("UPDATE org_memberships SET role = 'owner' WHERE user_id = :t AND org_id = :shared"), ids)
        await db.execute(text("UPDATE org_memberships SET role = 'member' WHERE user_id = :b"), ids)
        await db.commit()
        with pytest.raises(ue.EraseError) as err:
            await ue.execute_erase(db, ids["t"], admin_email="harvminhas@gmail.com", admin_uid="x", confirm_email=f"target-{tag}@example.com", acknowledge_subscriptions=True)
        assert err.value.code == "blocked"
        assert (await db.execute(text("SELECT count(*) FROM orgs WHERE id IN (:solo, :shared)"), ids)).scalar() == 2
        assert (await db.execute(text("SELECT count(*) FROM users WHERE id IN (:t, :b)"), ids)).scalar() == 2
        await db.execute(text("DELETE FROM orgs WHERE id IN (:solo, :shared)"), ids)
        await db.execute(text("DELETE FROM users WHERE id IN (:t, :b)"), ids)
        await db.commit()

    _run(scenario)


@pg
def test_erased_user_signing_in_again_gets_a_fresh_empty_account(monkeypatch):
    """Still signed in to Firebase after being erased: org routes 403 (the web app then goes to /home),
    and the org list (what /home calls) recreates an empty account, so /home sends them to create an org."""
    from fastapi import HTTPException
    from sqlalchemy import text
    from app.auth import AuthContext
    from app.services import tenancy

    monkeypatch.delenv("PLATFORM_ADMIN_EMAILS", raising=False)

    async def no_ms(*_a, **_k):
        return False

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", no_ms)

    async def scenario(db):
        ids, tag = await _seed(db)
        await db.commit()
        email = f"target-{tag}@example.com"
        await ue.execute_erase(db, ids["t"], admin_email="harvminhas@gmail.com", admin_uid="admin", confirm_email=email, acknowledge_subscriptions=False)
        auth = AuthContext("fb-t-" + tag, email=email, email_verified=True)
        with pytest.raises(HTTPException) as e:
            await tenancy._resolve_user(db, auth)
        assert e.value.status_code == 403
        await db.rollback()
        fresh = await tenancy._resolve_user(db, auth, create_if_missing=True)
        await db.commit()
        assert fresh.id != ids["t"] and fresh.email == email
        n = (await db.execute(text("SELECT count(*) FROM org_memberships WHERE user_id = :u"), {"u": fresh.id})).scalar()
        assert n == 0
        await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": fresh.id})
        await db.execute(text("DELETE FROM orgs WHERE id = :shared"), ids)
        await db.execute(text("DELETE FROM users WHERE id = :b"), ids)
        await db.commit()

    _run(scenario)
