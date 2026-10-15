"""Add-apps cards with a new tenant typed on one card and picked as "(new)" on another, saved through
the real batch path. The payload in fixtures/ is exactly what the web cards build (a web test keeps it
in sync). Runs against a migrated scratch Postgres when ERASE_TEST_DATABASE_URL is set."""
import asyncio
import json
import os
import pathlib
import uuid

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")
PAYLOAD = json.loads((pathlib.Path(__file__).parent / "fixtures" / "add_batch_shared_tenant.json").read_text())


def test_payload_names_one_tenant_and_links_both_apps():
    tenants = [c for c in PAYLOAD["creates"] if c["type"] == "cloud_service"]
    assert [t["name"] for t in tenants] == ["Azure Tenant"]
    links = [r for r in PAYLOAD["relationships"] if r["to_key"] == tenants[0]["key"]]
    assert len(links) == 2 and links[0]["attributes"] == {"region_key": "azure:canadaeast"}


@pg
def test_new_org_shared_new_tenant_saves_once_with_region():
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.services import cloud_regions as cr

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"h-{tag}@example.com"})
                await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'mam', :s)"), {"o": org, "s": "mam-" + tag})
                await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
                await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
                await db.commit()
            # The real endpoint: POST /orgs/{org}/workspaces/{ws}/objects/batch, auth and DB overridden.
            from httpx import ASGITransport, AsyncClient
            from app.auth import AuthContext, get_auth_context
            from app.database import get_db
            from app.main import app

            async def scratch_db():
                async with AsyncSession(engine, expire_on_commit=False) as session:
                    try:
                        yield session
                        await session.commit()
                    except Exception:
                        await session.rollback()
                        raise

            app.dependency_overrides[get_db] = scratch_db
            app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"h-{tag}@example.com", email_verified=True)
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
                    res = await client.post(f"/api/v1/orgs/mam-{tag}/workspaces/default/objects/batch", json=PAYLOAD)
            finally:
                app.dependency_overrides.clear()
            assert res.status_code == 200, res.text
            result = res.json()
            tenants = [o for o in result["objects"] if o["type"] == "cloud_service"]
            assert [t["name"] for t in tenants] == ["Azure Tenant"]
            tid = tenants[0]["id"]
            apps = {o["name"]: o["id"] for o in result["objects"] if o["type"] == "application"}
            runs = [r for r in result["relationships"] if r["type"] == "runs_on" and r["to_object_id"] == tid]
            assert sorted(r["from_object_id"] for r in runs) == sorted([apps["ACF List"], apps["Power App"]])
            if True:
                regions = {r["from_object_id"]: (r.get("attributes") or {}).get("region_key") for r in runs}
                assert regions[apps["ACF List"]] == "azure:canadaeast" and regions[apps["Power App"]] is None
            async with AsyncSession(engine, expire_on_commit=False) as db:
                # Persisted (a fresh session), visible in Clouds & tenants and as a platform record.
                listed = await cr.list_tenants(db, ws)
                assert [(t["name"], t["provider"], t["usage"]) for t in listed] == [("Azure Tenant", "azure", 2)]
                platforms = (await db.execute(text("SELECT name FROM objects WHERE workspace_id = :w AND type = 'cloud_service'"), {"w": ws})).scalars().all()
                assert platforms == ["Azure Tenant"]
                n = (await db.execute(text("SELECT count(*) FROM objects WHERE workspace_id = :w"), {"w": ws})).scalar()
                assert n == 4  # 3 apps + 1 tenant
        finally:
            async with AsyncSession(engine) as db:
                await db.execute(text("DELETE FROM change_log WHERE org_id = :o"), {"o": org})
                await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
                await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
                await db.commit()
            await engine.dispose()

    asyncio.run(go())
