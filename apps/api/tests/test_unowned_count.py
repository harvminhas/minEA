"""Deleting a person or team must not leave records counted as owned by nobody-in-particular."""
import asyncio
import os
import uuid

import pytest

from tests.test_ownership_roles import _cleanup, _seed

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


@pg
def test_deleted_owner_does_not_keep_a_record_owned():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.models.objects import MinEAObject
    from app.models.people import PeopleContact
    from app.services import people_directory

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                ana = PeopleContact(workspace_id=ws, org_id=org, name="Ana Ruiz")
                crm = MinEAObject(workspace_id=ws, org_id=org, type="application", name="CRM", properties={})
                erp = MinEAObject(workspace_id=ws, org_id=org, type="application", name="ERP", properties={})
                db.add_all([ana, crm, erp])
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
            app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"h-{tag}@example.com", email_verified=True)
            base = f"/api/v1/orgs/ow-{tag}/workspaces/default"
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                    r = await c.put(f"{base}/ownership/objects/{crm.id}", json={"roles": {"technical_owner": {"contact_id": str(ana.id)}}})
                    assert r.status_code == 200, r.text
                    assert (await c.get(base + "/ownership")).json()["unowned_count"] == 1  # ERP

                    # Delete the person from Org settings > People & teams.
                    async with AsyncSession(engine) as db:
                        await people_directory.delete(db, "person", ws, str(ana.id))
                        left = (await db.execute(text("SELECT count(*) FROM people_accountabilities WHERE subject_id = :a"), {"a": ana.id})).scalar_one()
                    assert left == 0
                    body = (await c.get(base + "/ownership")).json()
                    assert body["unowned_count"] == 2, body
                    assert {i["name"]: i["owned"] for i in body["items"]} == {"CRM": False, "ERP": False}

                    # Rows already left behind by earlier deletes (no FK on subject_id) are ignored too.
                    async with AsyncSession(engine) as db:
                        await db.execute(
                            text("INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind) "
                                 "VALUES (:id, :w, :o, 'team', :ghost, 'object', :e, 'business_owner')"),
                            {"id": uuid.uuid4(), "w": ws, "o": org, "ghost": uuid.uuid4(), "e": erp.id},
                        )
                        await db.commit()
                    body = (await c.get(base + "/ownership")).json()
                    assert body["unowned_count"] == 2 and all(not i["roles"] for i in body["items"]), body
            finally:
                app.dependency_overrides.clear()
        finally:
            await _cleanup(engine, org, user)
            await engine.dispose()

    asyncio.run(go())
