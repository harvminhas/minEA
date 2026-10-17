"""org_limits semantics for every limit key: a stored NULL is no cap (paid plans write it on upgrade);
only a missing row falls back to the plan default (plans.json / plan_features over DEFAULT_ORG_LIMITS).
Downgrading to Free writes the Free caps back over the NULLs. Runs against a migrated scratch Postgres
when ERASE_TEST_DATABASE_URL is set; the pure checks always run."""
import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")

# Every key the code reads from org_limits.
WRITTEN_KEYS = (
    "max_owners", "max_admins", "max_members", "max_viewers", "max_workspaces",
    "max_objects_per_workspace", "max_pending_invites", "max_active_share_links", "max_editor_seats",
)
ALL_KEYS = WRITTEN_KEYS + ("ai_extractions_per_month", "max_scenarios_per_workspace", "max_sandboxes_per_workspace")


def test_free_caps_every_written_key_so_a_downgrade_overwrites_nulls():
    from app.services.plan_apply import LIMIT_KEYS
    from app.services.plan_features import limits_for_plan

    free = limits_for_plan("free")
    assert set(LIMIT_KEYS) == set(WRITTEN_KEYS)
    for key in LIMIT_KEYS:
        assert free[key] is not None, key
    assert free["max_workspaces"] == 1 and free["max_objects_per_workspace"] == 50
    assert free["max_active_share_links"] == 1 and free["max_editor_seats"] == 1
    assert free["max_admins"] == free["max_members"] == free["max_viewers"] == free["max_pending_invites"] == 0


def test_admin_script_writes_the_same_keys():
    import importlib.util
    import pathlib

    path = pathlib.Path(__file__).parents[1] / "scripts" / "set_org_plan.py"
    spec = importlib.util.spec_from_file_location("set_org_plan", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from app.services.plan_apply import LIMIT_KEYS

    assert tuple(module.LIMIT_KEYS) == tuple(LIMIT_KEYS)


@asynccontextmanager
async def _org(plan: str = "free", sub: str | None = None, rows: dict | None = None, workspaces: int = 1, admins: int = 0):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    engine = create_async_engine(DB_URL)
    tag = uuid.uuid4().hex[:8]
    org = uuid.uuid4()
    users: list[uuid.UUID] = []
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(
            text("INSERT INTO orgs (id, name, slug, plan, stripe_subscription_id) VALUES (:o, 'n', :s, :p, :sub)"),
            {"o": org, "s": "null-" + tag, "p": plan, "sub": sub},
        )
        for key, value in (rows or {}).items():
            await db.execute(text("INSERT INTO org_limits (org_id, limit_key, value) VALUES (:o, :k, :v)"), {"o": org, "k": key, "v": value})
        for i in range(workspaces):
            await db.execute(text("INSERT INTO workspaces (org_id, name, slug) VALUES (:o, :n, :s)"), {"o": org, "n": f"W{i}", "s": f"w{i}"})
        for i in range(admins):
            user = uuid.uuid4()
            users.append(user)
            await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": f"fb-{tag}-{i}", "e": f"a{i}-{tag}@example.com"})
            await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'admin')"), {"u": user, "o": org})
        await db.commit()
        try:
            yield db, org
        finally:
            await db.rollback()
            await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
            for user in users:
                await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
            await db.commit()
            await engine.dispose()


async def _limits(db, org, keys=ALL_KEYS) -> dict:
    from app.services.authorization import get_org_limit

    return {key: await get_org_limit(db, org, key) for key in keys}


@pg
def test_stored_null_is_unlimited_for_every_key():
    from app.services.ask_quota import monthly_limit
    from app.services.licences import licence_cap

    async def go():
        rows = {key: None for key in ALL_KEYS + ("ai_questions_per_month",)}
        async with _org(plan="business", sub="sub_x", rows=rows) as (db, org):
            return await _limits(db, org), await licence_cap(db, org), await monthly_limit(db, org, "business")

    limits, seats, questions = asyncio.run(go())
    assert limits == {key: None for key in ALL_KEYS}
    assert seats is None and questions is None


@pg
def test_null_rows_lift_the_old_fallback_caps():
    """Before: NULL fell back to 10 workspaces / 5 admins, so a paid org was stuck there."""
    from app.services.authorization import check_limit

    async def go():
        rows = {"max_workspaces": None, "max_admins": None, "max_active_share_links": None, "ai_extractions_per_month": None}
        async with _org(plan="starter", sub="sub_x", rows=rows, workspaces=11, admins=6) as (db, org):
            return [
                (await check_limit(db, org, key, pending_delta=1))[0]
                for key in ("max_workspaces", "max_admins", "max_active_share_links", "ai_extractions_per_month")
            ]

    assert asyncio.run(go()) == [True, True, True, True]


@pg
def test_missing_rows_use_the_plan_default():
    from app.services.ask_quota import monthly_limit
    from app.services.plan_features import LEGACY_BUSINESS_LIMITS, limits_for_plan

    async def go():
        out = {}
        for plan, sub in (("free", None), ("starter", "sub_s"), ("team", "sub_t"), ("business", "sub_b"), ("business", None)):
            async with _org(plan=plan, sub=sub) as (db, org):
                out[(plan, sub)] = (await _limits(db, org), await monthly_limit(db, org, plan))
        return out

    out = asyncio.run(go())
    free, free_q = out[("free", None)]
    assert free_q == 25
    for key in ALL_KEYS:
        assert free[key] == limits_for_plan("free")[key], key
    assert free["max_objects_per_workspace"] == 50 and free["max_workspaces"] == 1 and free["max_active_share_links"] == 1
    starter, starter_q = out[("starter", "sub_s")]
    assert starter_q == 500
    assert starter["max_workspaces"] is None and starter["max_objects_per_workspace"] is None and starter["max_editor_seats"] == 1
    assert out[("team", "sub_t")][0]["max_editor_seats"] == 5
    assert out[("business", "sub_b")][0]["max_editor_seats"] == 10
    legacy = out[("business", None)][0]
    for key, value in LEGACY_BUSINESS_LIMITS.items():
        assert legacy[key] == value, key
    # Keys no plan sets keep the global default.
    assert free["ai_extractions_per_month"] == 100 and starter["max_owners"] == 1


@pg
def test_free_orgs_still_hit_their_caps():
    from sqlalchemy import text

    from app.services.authorization import check_limit, get_object_cap, seed_org_limits

    async def go():
        async with _org(plan="free", workspaces=1) as (db, org):
            await seed_org_limits(db, org, plan="free")
            workspaces = await check_limit(db, org, "max_workspaces", pending_delta=1)
            admins = await check_limit(db, org, "max_admins", pending_delta=1)
            invites = await check_limit(db, org, "max_pending_invites", pending_delta=1)
            await db.execute(text("UPDATE org_limits SET value = 2 WHERE org_id = :o AND limit_key = 'ai_extractions_per_month'"), {"o": org})
            await db.execute(text("INSERT INTO audit_log (org_id, action) VALUES (:o, 'extraction.run')"), {"o": org})
            second = await check_limit(db, org, "ai_extractions_per_month", pending_delta=1)
            await db.execute(text("INSERT INTO audit_log (org_id, action) VALUES (:o, 'extraction.run')"), {"o": org})
            third = await check_limit(db, org, "ai_extractions_per_month", pending_delta=1)
            return workspaces, admins, invites, second, third, await get_object_cap(db, org)

    workspaces, admins, invites, second, third, objects = asyncio.run(go())
    assert workspaces[0] is False and workspaces[1]["max"] == 1
    assert admins[0] is False and invites[0] is False
    assert second[0] is True
    assert third[0] is False and third[1]["max"] == 2  # was allowed one past the cap
    assert objects == 50


@pg
def test_upgrade_writes_nulls_and_downgrade_restores_free_caps():
    from app.services.plan_apply import LIMIT_KEYS, apply_plan_to_org
    from app.services.plan_features import limits_for_plan

    async def go():
        async with _org(plan="free") as (db, org):
            from app.services.authorization import seed_org_limits

            await seed_org_limits(db, org, plan="free")
            await apply_plan_to_org(db, org, "team", stripe_subscription_id="sub_t", stripe_managed=True)
            team = await _limits(db, org, LIMIT_KEYS)
            await apply_plan_to_org(db, org, "free", clear_stripe=True, stripe_managed=True)  # Stripe cancel
            free = await _limits(db, org, LIMIT_KEYS)
            await apply_plan_to_org(db, org, "business", contributors=3)  # admin script: legacy Business
            legacy = await _limits(db, org, LIMIT_KEYS)
            await apply_plan_to_org(db, org, "free")  # admin script back to Free
            free_again = await _limits(db, org, LIMIT_KEYS)
            return team, free, legacy, free_again

    team, free, legacy, free_again = asyncio.run(go())
    for key in ("max_workspaces", "max_objects_per_workspace", "max_members", "max_admins", "max_viewers"):
        assert team[key] is None, key
    assert team["max_editor_seats"] == 5 and team["max_active_share_links"] == 50
    expected_free = {key: limits_for_plan("free")[key] for key in LIMIT_KEYS}
    assert free == expected_free and free_again == expected_free
    assert legacy["max_workspaces"] is None and legacy["max_members"] == 3 and legacy["max_editor_seats"] is None


@pg
def test_null_ai_question_allowance_is_counted_but_never_refused():
    from app.services.ask_quota import take_question

    async def go():
        async with _org(plan="free", rows={"ai_questions_per_month": None}) as (db, org):
            last = None
            for _ in range(30):
                last = await take_question(db, org, "free")
            return last

    last = asyncio.run(go())
    assert last.allowed and last.used == 30 and last.limit is None
