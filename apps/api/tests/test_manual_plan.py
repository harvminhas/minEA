"""Platform admin: set an org's plan by hand from /platform/users."""

import asyncio
import os
import uuid

import pytest
from sqlalchemy import text

from app.routers import platform_admin, platform_catalog
from app.services import manual_plan as mp
from app.services import user_erase as ue

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def test_the_plan_endpoint_is_platform_admin_only():
    route = next(r for r in platform_admin.router.routes if r.path.endswith("/orgs/{org_slug}/plan"))
    assert platform_catalog.require_platform_admin in [d.call for d in route.dependant.dependencies]
    assert route.methods == {"POST"}
    assert mp.HAND_PLANS == ("free", "starter", "business")


def _run(fn):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    async def go():
        engine = create_async_engine(DB_URL)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                return await fn(db)
        finally:
            await engine.dispose()

    return asyncio.run(go())


async def _seed(db, *, stripe: bool = False):
    tag = uuid.uuid4().hex[:8]
    ids = {"o": uuid.uuid4(), "u": uuid.uuid4(), "a": uuid.uuid4()}
    await db.execute(text("INSERT INTO orgs (id, name, slug, plan, stripe_subscription_id) VALUES (:o, :n, :s, 'free', :sub)"),
                     {"o": ids["o"], "n": f"Org {tag}", "s": f"org-{tag}", "sub": "sub_123" if stripe else None})
    await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :fu, :e), (:a, :fa, 'harvminhas@gmail.com')"),
                     {"u": ids["u"], "fu": f"uid-{tag}", "e": f"owner-{tag}@example.com", "a": ids["a"], "fa": f"admin-{tag}"})
    await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), ids)
    await db.commit()
    return ids, tag


async def _cleanup(db, ids):
    await db.rollback()
    await db.execute(text("DELETE FROM orgs WHERE id = :o"), ids)
    await db.execute(text("DELETE FROM users WHERE id IN (:u, :a)"), ids)
    await db.commit()


@pg
def test_upgrade_by_hand_sets_pack_limits_audits_and_shows_on_the_row():
    async def scenario(db):
        ids, tag = await _seed(db)
        try:
            out = await mp.set_plan_by_hand(db, f"org-{tag}", "Business", reason="Pilot, 60 days", admin_email="HarvMinhas@gmail.com", admin_uid=f"admin-{tag}")
            assert out["plan"] == "business" and out["previous"] == "free"
            plan = (await db.execute(text("SELECT plan FROM orgs WHERE id = :o"), ids)).scalar()
            assert plan == "business"
            seats = (await db.execute(text("SELECT value FROM org_limits WHERE org_id = :o AND limit_key = 'max_editor_seats'"), ids)).scalar()
            assert seats == 10  # pack limits, same as Stripe Business
            audit = (await db.execute(text("SELECT actor_user_id, metadata FROM audit_log WHERE org_id = :o AND action = 'billing.manual_plan'"), ids)).one()
            assert audit.actor_user_id == ids["a"]
            assert audit.metadata == {"from": "free", "to": "business", "reason": "Pilot, 60 days", "actor_email": "harvminhas@gmail.com"}
            listed = await ue.list_users(db, q=f"owner-{tag}")
            org = listed[0]["orgs"][0]
            assert org["plan"] == "business"
            assert org["manual"]["by"] == "harvminhas@gmail.com" and org["manual"]["reason"] == "Pilot, 60 days"
            await mp.set_plan_by_hand(db, f"org-{tag}", "free", reason="", admin_email="harvminhas@gmail.com", admin_uid=f"admin-{tag}")
            listed = await ue.list_users(db, q=f"owner-{tag}")
            assert listed[0]["orgs"][0]["plan"] == "free" and listed[0]["orgs"][0]["manual"]["from"] == "business"
            seats = (await db.execute(text("SELECT value FROM org_limits WHERE org_id = :o AND limit_key = 'max_editor_seats'"), ids)).scalar()
            assert seats == 1
        finally:
            await _cleanup(db, ids)

    _run(scenario)


@pg
def test_stripe_orgs_bad_plans_and_no_ops_are_refused_and_nothing_changes():
    async def scenario(db):
        ids, tag = await _seed(db, stripe=True)
        try:
            with pytest.raises(mp.ManualPlanError) as err:
                await mp.set_plan_by_hand(db, f"org-{tag}", "business", reason="", admin_email="a@b.c", admin_uid="x")
            assert err.value.status == 409 and err.value.code == "stripe_subscription" and "Cancel in Stripe first" in err.value.message
            await db.rollback()
            await db.execute(text("UPDATE orgs SET stripe_subscription_id = NULL WHERE id = :o"), ids)
            await db.commit()
            for plan, code in (("team", "bad_plan"), ("enterprise", "bad_plan"), ("free", "same_plan")):
                with pytest.raises(mp.ManualPlanError) as err:
                    await mp.set_plan_by_hand(db, f"org-{tag}", plan, reason="", admin_email="a@b.c", admin_uid="x")
                assert err.value.code == code
                await db.rollback()
            with pytest.raises(mp.ManualPlanError) as err:
                await mp.set_plan_by_hand(db, "no-such-org", "business", reason="", admin_email="a@b.c", admin_uid="x")
            assert err.value.status == 404
            await db.rollback()
            assert (await db.execute(text("SELECT plan FROM orgs WHERE id = :o"), ids)).scalar() == "free"
            assert (await db.execute(text("SELECT count(*) FROM audit_log WHERE org_id = :o"), ids)).scalar() == 0
        finally:
            await _cleanup(db, ids)

    _run(scenario)
