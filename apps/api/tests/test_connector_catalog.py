"""An API linking two apps reaches the workspace catalog (both links), and data-layer writes mark the
catalog stale like every other write. Runs against a migrated scratch Postgres when
ERASE_TEST_DATABASE_URL is set; Firestore is stubbed."""
import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


@asynccontextmanager
async def _workspace(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.services import catalog_cache

    async def no_stored(_workspace_id):
        return None

    monkeypatch.setattr(catalog_cache, "_read_stored", no_stored)
    monkeypatch.setattr(catalog_cache, "_write_stored", lambda *_args: None)

    engine = create_async_engine(DB_URL)
    tag = uuid.uuid4().hex[:8]
    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"c-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug, plan) VALUES (:o, 'cc', :s, 'business')"), {"o": org, "s": "cc-" + tag})
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

    async def dirty(value: bool | None = None) -> bool:
        async with AsyncSession(engine) as db:
            if value is not None:
                await db.execute(text("UPDATE workspaces SET catalog_dirty = :v WHERE id = :w"), {"v": value, "w": ws})
                await db.commit()
            return bool((await db.execute(text("SELECT catalog_dirty FROM workspaces WHERE id = :w"), {"w": ws})).scalar_one())

    app.dependency_overrides[get_db] = scratch_db
    app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"c-{tag}@example.com", email_verified=True)
    base = f"/api/v1/orgs/cc-{tag}/workspaces/default"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            yield client, base, dirty
    finally:
        app.dependency_overrides.clear()
        async with AsyncSession(engine) as db:
            await db.execute(text("DELETE FROM change_log WHERE org_id = :o"), {"o": org})
            await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
            await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
            await db.commit()
        await engine.dispose()


@pg
def test_api_between_two_apps_is_in_the_catalog_both_ends(monkeypatch):
    async def go():
        async with _workspace(monkeypatch) as (client, base, _dirty):
            ids = {}
            for name, kind in (("Billing", "application"), ("CRM", "application"), ("Orders API", "api")):
                res = await client.post(f"{base}/objects", json={"type": kind, "name": name})
                assert res.status_code == 201, res.text
                ids[name] = res.json()["id"]
            for rel_type, app in (("exposes", "Billing"), ("consumes", "CRM")):
                res = await client.post(f"{base}/relationships", json={
                    "type": rel_type, "from_object_id": ids[app], "from_type": "application",
                    "to_object_id": ids["Orders API"], "to_type": "api",
                })
                assert res.status_code == 201, res.text
            catalog = await client.get(f"{base}/catalog")
            assert catalog.status_code == 200, catalog.text
            return ids, catalog.json()

    ids, catalog = asyncio.run(go())
    links = {(r["type"], r["from_object_id"], r["to_object_id"]) for r in catalog["relationships"]}
    assert ("exposes", ids["Billing"], ids["Orders API"]) in links
    assert ("consumes", ids["CRM"], ids["Orders API"]) in links
    assert any(o["id"] == ids["Orders API"] and o["type"] == "api" for o in catalog["objects"])


@pg
def test_data_layer_writes_mark_the_catalog_stale(monkeypatch):
    async def go():
        async with _workspace(monkeypatch) as (client, base, dirty):
            seen = {}
            await dirty(False)
            store = await client.post(f"{base}/data/stores", json={"name": "Warehouse"})
            assert store.status_code == 201, store.text
            seen["create store"] = await dirty()
            await dirty(False)
            res = await client.put(f"{base}/data/stores/{store.json()['id']}", json={"name": "Warehouse 2"})
            assert res.status_code == 200, res.text
            seen["update store"] = await dirty()
            await dirty(False)
            entity = await client.post(f"{base}/data/entities", json={"name": "Customer"})
            assert entity.status_code == 201, entity.text
            seen["create entity"] = await dirty()
            await dirty(False)
            res = await client.post(f"{base}/data/stores/{store.json()['id']}/links", json={
                "entity_kind": "data_object", "entity_id": entity.json()["id"], "link_kind": "stores",
            })
            assert res.status_code == 204, res.text
            seen["store link"] = await dirty()
            return seen

    seen = asyncio.run(go())
    assert seen == {"create store": True, "update store": True, "create entity": True, "store link": True}
