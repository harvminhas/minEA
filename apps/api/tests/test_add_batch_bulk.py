"""POST .../objects/batch at size: the 119 apps pasted into Add apps timed out (504) because every
item cost ~8 serial SQL statements. Creates are now one multi-row INSERT, so the statement count is
the same for 5 items as for 120; and a repeated Add with the same Idempotency-Key replays the first
result instead of saving everything twice. Runs against a migrated scratch Postgres when
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
PAYLOAD_119 = json.loads((pathlib.Path(__file__).parent / "fixtures" / "add_batch_119.json").read_text())
# The statement budget for a creates-only batch (auth, permission, limit, insert, change log,
# snapshot notify). It must not depend on the number of items.
MAX_STATEMENTS = 30


def _creates(n: int, tag: str = "") -> dict:
    return {
        "creates": [
            {"key": f"k{i}", "type": "application", "name": f"App {tag}{i}", "properties": {"hosting_model": "saas"}}
            for i in range(n)
        ],
        "updates": [],
        "relationships": [],
    }


@asynccontextmanager
async def _tenant():
    """A fresh user/org/workspace on the scratch DB and an HTTP client on the real app."""
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import event, text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app

    engine = create_async_engine(DB_URL)
    tag = uuid.uuid4().hex[:8]
    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    counter = {"n": 0}

    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def _count(*_args):
        counter["n"] += 1

    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email, full_name) VALUES (:u, :f, :e, 'Sam Rivera')"), {"u": user, "f": "fb-" + tag, "e": f"b-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug, plan) VALUES (:o, 'bulk', :s, 'starter')"), {"o": org, "s": "bulk-" + tag})
        await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
        await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
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
    app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"b-{tag}@example.com", email_verified=True)
    url = f"/api/v1/orgs/bulk-{tag}/workspaces/default/objects/batch"

    async def count_rows(sql: str) -> int:
        async with AsyncSession(engine) as db:
            return (await db.execute(text(sql), {"w": ws, "o": org})).scalar_one()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t", timeout=120) as client:
            yield {"client": client, "url": url, "counter": counter, "ws": ws, "org": org, "user": user,
                   "engine": engine, "count": count_rows}
    finally:
        app.dependency_overrides.clear()
        async with AsyncSession(engine) as db:
            await db.execute(text("DELETE FROM change_log WHERE org_id = :o"), {"o": org})
            await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
            await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
            await db.commit()
        await engine.dispose()


async def _post_counted(t, body, headers=None):
    t["counter"]["n"] = 0
    res = await t["client"].post(t["url"], json=body, headers=headers or {})
    return res, t["counter"]["n"]


@pg
def test_statement_count_does_not_grow_with_items():
    async def go():
        async with _tenant() as t:
            # The first request of a new user/workspace also stamps email_verified_at and creates the
            # snapshot row; count from the second on.
            await _post_counted(t, _creates(1, "warm"))
            res5, n5 = await _post_counted(t, _creates(5, "a"))
            res120, n120 = await _post_counted(t, _creates(120, "b"))
            assert res5.status_code == 200, res5.text
            assert res120.status_code == 200, res120.text
            assert len(res120.json()["objects"]) == 120
            return n5, n120

    n5, n120 = asyncio.run(go())
    assert n5 == n120, f"5 items: {n5} statements, 120 items: {n120}"
    assert n120 <= MAX_STATEMENTS, n120


@pg
def test_119_pasted_apps_save_in_one_batch():
    async def go():
        async with _tenant() as t:
            res, statements = await _post_counted(t, PAYLOAD_119)
            assert res.status_code == 200, res.text
            body = res.json()
            stored = await t["count"]("SELECT count(*) FROM objects WHERE workspace_id = :w")
            logged = await t["count"](
                "SELECT count(*) FROM change_log WHERE workspace_id = :w AND action = 'created' "
                "AND diff->>'action_type' = 'created_object'"
            )
            return body, statements, stored, logged, t["user"]

    body, statements, stored, logged, user = asyncio.run(go())
    creates = PAYLOAD_119["creates"]
    assert len(creates) == 119
    assert stored == 119 and logged == 119
    assert statements <= MAX_STATEMENTS
    # Same response shape and order as before: one ObjectRead per create, in request order.
    assert [o["name"] for o in body["objects"]] == [c["name"] for c in creates]
    assert body["created_object_ids"] == [o["id"] for o in body["objects"]]
    assert body["relationships"] == [] and body["created_relationship_ids"] == []
    for o in body["objects"]:
        assert o["capability_count"] == 0 and o["apis_provided_count"] == 0 and o["data_store_count"] == 0
        assert o["updated_by_name"] == "Sam"
        assert o["created_by"] == str(user)
        assert o["created_at"] and o["updated_at"]
    costed = [o for o in body["objects"] if (o["properties"] or {}).get("cost_lines")]
    assert len(costed) == sum(1 for c in creates if c["properties"].get("cost_lines"))


@pg
def test_batch_reads_match_single_reads_for_creates_updates_and_links():
    """_to_reads (one pass) returns exactly what _to_read returned per object, including counts for
    a new app linked in the same batch and for an updated app."""
    async def go():
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import AsyncSession

        import app.routers.objects as ro
        from app.models.objects import MinEAObject

        async with _tenant() as t:
            first = await t["client"].post(t["url"], json=_creates(1, "old"))
            old_id = first.json()["objects"][0]["id"]
            body = {
                "creates": [
                    {"key": "crm", "type": "application", "name": "CRM", "properties": {}},
                    {"key": "api", "type": "api", "name": "CRM API", "properties": {}},
                    {"key": "sell", "type": "capability", "name": "Sell", "properties": {}},
                ],
                "updates": [{"id": old_id, "properties": {"vendor": "Acme"}}],
                "relationships": [
                    {"type": "exposes", "from_key": "crm", "to_key": "api", "from_type": "application", "to_type": "api"},
                    {"type": "supported_by", "from_key": "sell", "to_id": old_id, "from_type": "capability", "to_type": "application"},
                ],
            }
            res = await t["client"].post(t["url"], json=body)
            assert res.status_code == 200, res.text
            batch = {o["id"]: o for o in res.json()["objects"]}
            async with AsyncSession(t["engine"], expire_on_commit=False) as db:
                rows = (await db.execute(select(MinEAObject).where(MinEAObject.workspace_id == t["ws"]))).scalars().all()
                single = {str(o.id): (await ro._to_read(db, o)).model_dump(mode="json") for o in rows}
            return batch, single, old_id

    batch, single, old_id = asyncio.run(go())
    assert len(batch) == 4
    for oid, read in batch.items():
        assert read == single[oid], oid
    crm = next(o for o in batch.values() if o["name"] == "CRM")
    assert crm["apis_provided_count"] == 1
    assert batch[old_id]["capability_count"] == 1 and batch[old_id]["properties"]["vendor"] == "Acme"


@pg
def test_links_existing_and_repeated_in_one_batch_are_saved_once():
    async def go():
        async with _tenant() as t:
            first = await t["client"].post(t["url"], json=_creates(2, "l"))
            a, b = (o["id"] for o in first.json()["objects"])
            link = {"type": "depends_on", "from_id": a, "to_id": b, "from_type": "application", "to_type": "application"}
            one = await t["client"].post(t["url"], json={"relationships": [link, link]})
            two = await t["client"].post(t["url"], json={"relationships": [link]})
            stored = await t["count"]("SELECT count(*) FROM relationships WHERE workspace_id = :w")
            return one.json(), two.json(), stored

    one, two, stored = asyncio.run(go())
    assert stored == 1
    assert len(one["relationships"]) == 2 and one["relationships"][0]["id"] == one["relationships"][1]["id"]
    assert one["created_relationship_ids"] == [one["relationships"][0]["id"]]
    assert two["created_relationship_ids"] == [] and two["relationships"][0]["id"] == one["relationships"][0]["id"]


@pg
def test_owner_names_resolve_once_per_batch():
    async def go():
        async with _tenant() as t:
            body = _creates(4, "o")
            for item in body["creates"]:
                item.update(owner="Finance", owner_team_name="Finance", point_of_contact_name="Priya Shah")
            res = await t["client"].post(t["url"], json=body)
            teams = await t["count"]("SELECT count(*) FROM teams WHERE workspace_id = :w")
            contacts = await t["count"]("SELECT count(*) FROM people_contacts WHERE workspace_id = :w")
            return res, teams, contacts

    res, teams, contacts = asyncio.run(go())
    assert res.status_code == 200, res.text
    assert teams == 1 and contacts == 1
    assert {o["owner_team_name"] for o in res.json()["objects"]} == {"Finance"}
    assert {o["point_of_contact_name"] for o in res.json()["objects"]} == {"Priya Shah"}


@pg
def test_repeated_add_with_same_key_returns_the_first_result():
    async def go():
        async with _tenant() as t:
            key = {"Idempotency-Key": "add-" + uuid.uuid4().hex}
            body = _creates(3, "i")
            first = await t["client"].post(t["url"], json=body, headers=key)
            again = await t["client"].post(t["url"], json=body, headers=key)
            other = await t["client"].post(t["url"], json=_creates(2, "j"), headers=key)
            stored = await t["count"]("SELECT count(*) FROM objects WHERE workspace_id = :w")
            fresh = await t["client"].post(t["url"], json=body, headers={"Idempotency-Key": "add-" + uuid.uuid4().hex})
            return first, again, other, stored, fresh

    first, again, other, stored, fresh = asyncio.run(go())
    assert first.status_code == 200 and again.status_code == 200
    assert again.json() == first.json()
    assert stored == 3
    assert other.status_code == 409
    assert fresh.status_code == 200 and fresh.json()["created_object_ids"] != first.json()["created_object_ids"]


@pg
def test_repeat_sent_while_the_first_is_still_saving_waits_and_replays():
    async def go():
        async with _tenant() as t:
            key = {"Idempotency-Key": "add-" + uuid.uuid4().hex}
            body = _creates(40, "c")
            a, b = await asyncio.gather(
                t["client"].post(t["url"], json=body, headers=key),
                t["client"].post(t["url"], json=body, headers=key),
            )
            stored = await t["count"]("SELECT count(*) FROM objects WHERE workspace_id = :w")
            return a, b, stored

    a, b, stored = asyncio.run(go())
    assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)
    assert a.json()["created_object_ids"] == b.json()["created_object_ids"]
    assert stored == 40


@pg
def test_bad_key_is_rejected():
    async def go():
        async with _tenant() as t:
            return await t["client"].post(t["url"], json=_creates(1), headers={"Idempotency-Key": "a b"})

    assert asyncio.run(go()).status_code == 400
