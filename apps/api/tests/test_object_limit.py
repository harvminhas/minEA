"""Free covers 50 apps & AI agents per workspace; every other type is unlimited. The ones being added
count: 50 stored blocks the 51st, a batch that would pass the cap is refused whole, and the 403 says
how many fit. A workspace already over the cap can still edit and delete. Runs against a migrated scratch Postgres when
ERASE_TEST_DATABASE_URL is set."""
import asyncio
import json
import os
import pathlib
import uuid
from contextlib import asynccontextmanager

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def test_plans_json_free_items_match_the_enforced_limit():
    from app.services.plan_features import PLAN_LIMIT_OVERRIDES

    plans = json.loads((pathlib.Path(__file__).parents[1] / "app" / "services" / "plans.json").read_text())["plans"]
    for key, plan in plans.items():
        assert plan["apps_agents_per_workspace"] == PLAN_LIMIT_OVERRIDES[key]["max_objects_per_workspace"], key
    assert plans["free"]["apps_agents_per_workspace"] == 50


def _creates(n: int, tag: str) -> dict:
    return {"creates": [{"key": f"k{i}", "type": "application", "name": f"{tag} {i}", "properties": {}} for i in range(n)], "updates": [], "relationships": []}


@asynccontextmanager
async def _workspace(cap: int | None = 50, stored: int = 0, plan: str = "free", others: int = 0):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app

    engine = create_async_engine(DB_URL)
    tag = uuid.uuid4().hex[:8]
    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"l-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug, plan) VALUES (:o, 'lim', :s, :p)"), {"o": org, "s": "lim-" + tag, "p": plan})
        await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
        await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
        await db.execute(text("INSERT INTO org_limits (org_id, limit_key, value) VALUES (:o, 'max_objects_per_workspace', :v)"), {"o": org, "v": cap})
        for i in range(stored):
            await db.execute(text("INSERT INTO objects (workspace_id, org_id, type, name) VALUES (:w, :o, 'application', :n)"), {"w": ws, "o": org, "n": f"Stored {i}"})
        for i in range(others):
            kind = ("model", "cloud_service", "data_object", "location", "capability")[i % 5]
            await db.execute(text("INSERT INTO objects (workspace_id, org_id, type, name) VALUES (:w, :o, :t, :n)"), {"w": ws, "o": org, "t": kind, "n": f"Other {i}"})
        await db.commit()

    async def scratch_db():
        async with AsyncSession(engine, expire_on_commit=False) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = scratch_db
    app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"l-{tag}@example.com", email_verified=True)
    base = f"/api/v1/orgs/lim-{tag}/workspaces/default"

    async def count() -> int:
        async with AsyncSession(engine) as db:
            return (await db.execute(text("SELECT count(*) FROM objects WHERE workspace_id = :w AND type IN ('application', 'agent')"), {"w": ws})).scalar_one()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            yield client, base, count
    finally:
        app.dependency_overrides.clear()
        async with AsyncSession(engine) as db:
            await db.execute(text("DELETE FROM change_log WHERE org_id = :o"), {"o": org})
            await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
            await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
            await db.commit()
        await engine.dispose()


@pg
def test_single_add_blocks_the_51st():
    async def go():
        async with _workspace(stored=49) as (client, base, count):
            ok = await client.post(f"{base}/objects", json={"type": "application", "name": "Fiftieth"})
            blocked = await client.post(f"{base}/objects", json={"type": "application", "name": "Fifty-first"})
            return ok, blocked, await count()

    ok, blocked, stored = asyncio.run(go())
    assert ok.status_code == 201, ok.text
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == {
        "code": "limit_exceeded", "limit": "max_objects_per_workspace",
        "current": 50, "max": 50, "adding": 1, "remaining": 0, "plan": "free",
    }
    assert stored == 50


@pg
def test_batch_past_the_cap_is_refused_whole_and_says_how_many_fit():
    async def go():
        async with _workspace(stored=0) as (client, base, count):
            big = await client.post(f"{base}/objects/batch", json=_creates(120, "Big"))
            after_big = await count()
            exact = await client.post(f"{base}/objects/batch", json=_creates(50, "Fits"))
            return big, after_big, exact, await count()

    big, after_big, exact, stored = asyncio.run(go())
    assert big.status_code == 403
    detail = big.json()["detail"]
    assert (detail["current"], detail["adding"], detail["remaining"], detail["max"], detail["plan"]) == (0, 120, 50, 50, "free")
    assert after_big == 0
    assert exact.status_code == 200 and stored == 50


@pg
def test_workspace_already_over_can_edit_and_delete_but_not_create():
    async def go():
        async with _workspace(stored=60) as (client, base, count):
            listed = (await client.get(f"{base}/objects?page_size=5")).json()["items"]
            first, second = listed[0]["id"], listed[1]["id"]
            edit = await client.put(f"{base}/objects/{first}", json={"name": "Renamed"})
            delete = await client.delete(f"{base}/objects/{second}")
            create = await client.post(f"{base}/objects", json={"type": "application", "name": "One more"})
            batch_update = await client.post(f"{base}/objects/batch", json={"updates": [{"id": first, "properties": {"vendor": "Acme"}}]})
            return edit, delete, create, batch_update, await count()

    edit, delete, create, batch_update, stored = asyncio.run(go())
    assert edit.status_code == 200, edit.text
    assert delete.status_code == 204
    assert batch_update.status_code == 200, batch_update.text
    assert create.status_code == 403 and create.json()["detail"]["remaining"] == 0
    assert stored == 59


@pg
def test_limit_endpoint_reports_the_org_override():
    async def go():
        async with _workspace(cap=30, stored=12) as (client, base, _count):
            return (await client.get(f"{base}/objects/limit")).json()

    assert asyncio.run(go()) == {"limit": "max_objects_per_workspace", "current": 12, "max": 30, "remaining": 18, "plan": "free"}


@pg
def test_paid_plan_has_no_cap():
    async def go():
        async with _workspace(cap=None, stored=0, plan="starter") as (client, base, count):
            room = (await client.get(f"{base}/objects/limit")).json()
            res = await client.post(f"{base}/objects/batch", json=_creates(120, "Paid"))
            return room, res, await count()

    room, res, stored = asyncio.run(go())
    assert room["max"] is None and room["remaining"] is None
    assert res.status_code == 200 and stored == 120


@pg
def test_only_apps_and_agents_count():
    """50 apps stored: servers, tenants, data, locations, capabilities still save; another app or AI agent doesn't."""
    async def go():
        async with _workspace(stored=50, others=80) as (client, base, count):
            room = (await client.get(f"{base}/objects/limit")).json()
            others = await client.post(f"{base}/objects/batch", json={"creates": [
                {"key": "s", "type": "model", "name": "Back-room server", "properties": {}},
                {"key": "t", "type": "cloud_service", "name": "Azure tenant", "properties": {}},
                {"key": "l", "type": "location", "name": "Head office", "properties": {}},
            ], "updates": [], "relationships": []})
            single_server = await client.post(f"{base}/objects", json={"type": "model", "name": "Spare server"})
            entity = await client.post(f"{base}/data/entities", json={"name": "Customer"})
            agent = await client.post(f"{base}/objects", json={"type": "agent", "name": "Invoice bot"})
            app = await client.post(f"{base}/objects/batch", json=_creates(1, "One more"))
            return room, others, single_server, entity, agent, app, await count()

    room, others, single_server, entity, agent, app, counted = asyncio.run(go())
    assert room["current"] == 50 and room["remaining"] == 0, room
    assert others.status_code == 200, others.text
    assert single_server.status_code == 201, single_server.text
    assert entity.status_code == 201, entity.text
    assert agent.status_code == 403 and agent.json()["detail"]["adding"] == 1
    assert app.status_code == 403
    assert counted == 50


@pg
def test_a_card_with_a_new_tenant_costs_one():
    async def go():
        async with _workspace(stored=49) as (client, base, count):
            res = await client.post(f"{base}/objects/batch", json={"creates": [
                {"key": "a", "type": "application", "name": "Fiftieth", "properties": {}},
                {"key": "t", "type": "cloud_service", "name": "Our AWS", "properties": {}},
            ], "updates": [], "relationships": [{"type": "runs_on", "from_key": "a", "to_key": "t", "from_type": "application", "to_type": "cloud_service"}]})
            return res, await count()

    res, counted = asyncio.run(go())
    assert res.status_code == 200, res.text
    assert counted == 50


@pg
def test_switching_a_server_into_an_app_needs_room():
    async def go():
        async with _workspace(stored=50, others=1) as (client, base, _count):
            server = (await client.get(f"{base}/objects?type=model")).json()["items"][0]
            switch = await client.post(f"{base}/objects/{server['id']}/switch-type", json={"type": "application"})
            return switch

    switch = asyncio.run(go())
    assert switch.status_code == 403 and switch.json()["detail"]["code"] == "limit_exceeded", switch.text


def test_counted_types():
    from app.services.authorization import LIMITED_OBJECT_TYPES, counted_types

    assert LIMITED_OBJECT_TYPES == {"application", "agent"}
    assert counted_types(["application", "cloud_service", "model", "agent", "ai_model", "data_object"]) == 2
