"""Delete impact counts, domain-delete L3 closure, and structure moves."""
from __future__ import annotations

import os
import uuid

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


async def _seed(engine, tag):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(
            text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"),
            {"u": user, "f": "fb-" + tag, "e": f"s-{tag}@example.com"},
        )
        await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'st', :s)"), {"o": org, "s": "st-" + tag})
        await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
        await db.execute(
            text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"),
            {"w": ws, "o": org},
        )
        await db.commit()
    return org, ws, user


async def _cleanup(engine, org, user):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    async with AsyncSession(engine) as db:
        await db.execute(text("DELETE FROM change_log WHERE org_id = :o"), {"o": org})
        await db.execute(text("DELETE FROM audit_log WHERE org_id = :o"), {"o": org})
        await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
        await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
        await db.commit()
    await engine.dispose()


@pg
def test_delete_impact_counts_cascade_and_move_keep_children_in_sync():
    import asyncio

    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.models.objects import MinEAObject
    from app.models.relationships import Relationship

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async def scratch_db():
                async with AsyncSession(engine, expire_on_commit=False) as session:
                    try:
                        yield session
                        await session.commit()
                    except Exception:
                        await session.rollback()
                        raise

            app.dependency_overrides[get_db] = scratch_db
            app.dependency_overrides[get_auth_context] = lambda: AuthContext(
                "fb-" + tag, email=f"s-{tag}@example.com", email_verified=True
            )
            base = f"/api/v1/orgs/st-{tag}/workspaces/default"
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                    sales = (await c.post(f"{base}/objects", json={"type": "business_domain", "name": "Sales", "properties": {}})).json()
                    service = (await c.post(f"{base}/objects", json={"type": "business_domain", "name": "Service", "properties": {}})).json()
                    lead = (await c.post(f"{base}/objects", json={"type": "capability", "name": "Lead capture", "properties": {"domain_id": sales["id"]}})).json()
                    care = (await c.post(f"{base}/objects", json={"type": "capability", "name": "Customer care", "properties": {"domain_id": sales["id"]}})).json()
                    qualify = (await c.post(f"{base}/objects", json={"type": "capability", "name": "Qualify leads", "properties": {"domain_id": sales["id"], "parent_id": lead["id"]}})).json()
                    # Orphan-risk L3: parent is an L2 in Sales, but no domain_id on the activity.
                    outreach = (await c.post(f"{base}/objects", json={"type": "capability", "name": "Outreach", "properties": {"parent_id": lead["id"]}})).json()
                    app_a = (await c.post(f"{base}/objects", json={"type": "application", "name": "CRM", "properties": {}})).json()
                    app_b = (await c.post(f"{base}/objects", json={"type": "application", "name": "Mailer", "properties": {}})).json()
                    await c.post(f"{base}/relationships", json={
                        "type": "supported_by", "from_object_id": qualify["id"], "from_type": "capability",
                        "to_object_id": app_a["id"], "to_type": "application",
                    })
                    await c.post(f"{base}/relationships", json={
                        "type": "supported_by", "from_object_id": outreach["id"], "from_type": "capability",
                        "to_object_id": app_b["id"], "to_type": "application",
                    })

                    lead_impact = (await c.get(f"{base}/capability-map/nodes/{lead['id']}/delete-impact")).json()
                    assert lead_impact["kind"] == "capability"
                    assert lead_impact["activities"] == 2
                    assert lead_impact["application_links"] == 2
                    assert lead_impact["capabilities"] == 0

                    domain_impact = (await c.get(f"{base}/capability-map/nodes/{sales['id']}/delete-impact")).json()
                    assert domain_impact["kind"] == "domain"
                    assert domain_impact["capabilities"] == 2
                    assert domain_impact["activities"] == 2
                    assert domain_impact["application_links"] == 2

                    act_impact = (await c.get(f"{base}/capability-map/nodes/{qualify['id']}/delete-impact")).json()
                    assert act_impact["kind"] == "activity"
                    assert act_impact["activities"] == 0
                    assert act_impact["application_links"] == 1

                    # Move L2 to Service; both activities (including the one without domain_id) follow.
                    moved = await c.post(f"{base}/capability-map/nodes/{lead['id']}/move", json={"domain_id": service["id"]})
                    assert moved.status_code == 200, moved.text
                    assert moved.json()["domain_id"] == service["id"]

                    async with AsyncSession(engine, expire_on_commit=False) as db:
                        rows = (await db.execute(select(MinEAObject).where(MinEAObject.workspace_id == ws, MinEAObject.type == "capability"))).scalars().all()
                        by_name = {row.name: row for row in rows}
                        assert str((by_name["Lead capture"].properties or {}).get("domain_id")) == service["id"]
                        assert str((by_name["Qualify leads"].properties or {}).get("domain_id")) == service["id"]
                        assert str((by_name["Outreach"].properties or {}).get("domain_id")) == service["id"]
                        assert str((by_name["Customer care"].properties or {}).get("domain_id")) == sales["id"]

                    # Move Outreach under Customer care (still in Sales).
                    moved_act = await c.post(
                        f"{base}/capability-map/nodes/{outreach['id']}/move",
                        json={"parent_id": care["id"]},
                    )
                    assert moved_act.status_code == 200, moved_act.text
                    assert moved_act.json()["parent_id"] == care["id"]
                    assert moved_act.json()["domain_id"] == sales["id"]

                    # New domain created inline while moving Lead capture back out of Service.
                    created = await c.post(
                        f"{base}/capability-map/nodes/{lead['id']}/move",
                        json={"new_domain_name": "Marketing"},
                    )
                    assert created.status_code == 200, created.text
                    new_domain_id = created.json()["created_domain_id"]
                    assert new_domain_id
                    assert created.json()["domain_id"] == new_domain_id

                    # New capability created inline while moving Qualify leads.
                    created_cap = await c.post(
                        f"{base}/capability-map/nodes/{qualify['id']}/move",
                        json={"new_capability_name": "Pipeline", "domain_id": new_domain_id},
                    )
                    assert created_cap.status_code == 200, created_cap.text
                    assert created_cap.json()["created_capability_id"]
                    assert created_cap.json()["parent_id"] == created_cap.json()["created_capability_id"]

                    # Delete Sales. Customer care (still in Sales) and Outreach (now under it) go.
                    # Lead capture was moved to Marketing, so it and Pipeline's activity stay.
                    deleted = await c.delete(f"{base}/objects/{sales['id']}")
                    assert deleted.status_code in {200, 204}, deleted.text

                    async with AsyncSession(engine, expire_on_commit=False) as db:
                        leftover = (await db.execute(select(MinEAObject).where(MinEAObject.workspace_id == ws))).scalars().all()
                        names = {row.name for row in leftover}
                        assert "Sales" not in names
                        assert "Customer care" not in names
                        assert "Outreach" not in names
                        assert "Lead capture" in names
                        assert "Qualify leads" in names
                        assert "Marketing" in names
                        assert "Pipeline" in names
                        # Apps themselves remain even though some links were attached to deleted nodes.
                        assert "CRM" in names and "Mailer" in names
                        links = (await db.execute(select(Relationship).where(Relationship.workspace_id == ws, Relationship.type == "supported_by"))).scalars().all()
                        # Qualify leads still exists, so the CRM link should remain; Mailer was on Outreach and must be gone.
                        to_names = {row.to_object_id for row in links}
                        apps = {row.id: row.name for row in leftover if row.type == "application"}
                        remaining = {apps[i] for i in to_names if i in apps}
                        assert "CRM" in remaining
                        assert "Mailer" not in remaining
            finally:
                app.dependency_overrides.clear()
        finally:
            await _cleanup(engine, org, user)

    asyncio.run(go())
