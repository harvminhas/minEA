"""Relationship wording against a migrated scratch Postgres (ERASE_TEST_DATABASE_URL): the product
graph's supported_by lookup, the reversed-duplicate guard, and owner-team accountabilities."""
import asyncio
import os
import uuid

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def test_supporting_systems_follow_the_stored_direction():
    from app.services.product_graph import systems_supporting_capabilities

    cap, app, agent, other = (uuid.uuid4() for _ in range(4))
    rows = [
        (cap, app, "supported_by"),  # capability -> application, as stored
        (agent, cap, "supports"),  # agent -> capability, as stored
        (app, other, "supported_by"),  # not about this capability
    ]
    assert systems_supporting_capabilities(rows, {cap}) == [app, agent]


async def _seed(engine, tag):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"h-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'rl', :s)"), {"o": org, "s": "rl-" + tag})
        await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
        await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
        await db.commit()
    return org, ws, user


async def _cleanup(engine, org, user):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    async with AsyncSession(engine) as db:
        await db.execute(text("DELETE FROM change_log WHERE org_id = :o"), {"o": org})
        await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
        await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": user})
        await db.commit()
    await engine.dispose()


async def _obj(db, org, ws, kind, name, **extra):
    from app.models.objects import MinEAObject

    obj = MinEAObject(workspace_id=ws, org_id=org, type=kind, name=name, properties={}, **extra)
    db.add(obj)
    await db.flush()
    return obj


@pg
def test_product_graph_finds_systems_linked_by_supported_by():
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.models.relationships import Relationship
    from app.models.views_graph import Product, ProductCapability
    from app.services.product_graph import build_product_graph, load_product_for_graph

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                cap = await _obj(db, org, ws, "capability", "Billing")
                app = await _obj(db, org, ws, "application", "Stripe")
                azure = await _obj(db, org, ws, "cloud_service", "Azure")
                product = Product(workspace_id=ws, org_id=org, name="Payments")
                db.add(product)
                await db.flush()
                db.add(ProductCapability(product_id=product.id, capability_id=cap.id))
                for rel_type, a, b in (("supported_by", cap, app), ("runs_on", app, azure)):
                    db.add(Relationship(workspace_id=ws, org_id=org, type=rel_type, from_object_id=a.id, from_type=a.type, to_object_id=b.id, to_type=b.type, attributes={}))
                await db.commit()
                loaded = await load_product_for_graph(db, product.id, ws, org)
                graph = await build_product_graph(db, loaded)
            labels = {node["label"] for node in graph["nodes"]}
            assert {"Payments", "Billing", "Stripe", "Azure"} <= labels
            edge_labels = sorted(edge["label"] for edge in graph["edges"])
            assert edge_labels == ["Delivers", "Runs on", "Supported by"]
            assert all("_" not in label for label in edge_labels)
        finally:
            await _cleanup(engine, org, user)

    asyncio.run(go())


@pg
def test_reversed_duplicate_is_refused_with_both_readings():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                crm = await _obj(db, org, ws, "application", "CRM")
                erp = await _obj(db, org, ws, "application", "ERP")
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
            url = f"/api/v1/orgs/rl-{tag}/workspaces/default/relationships"

            def body(rel_type, a, b):
                return {"type": rel_type, "from_object_id": str(a.id), "from_type": "application", "to_object_id": str(b.id), "to_type": "application"}

            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
                    first = await client.post(url, json=body("part_of", crm, erp))
                    assert first.status_code == 201, first.text
                    again = await client.post(url, json=body("part_of", crm, erp))
                    assert again.status_code == 200
                    flipped = await client.post(url, json=body("part_of", erp, crm))
                    assert flipped.status_code == 409, flipped.text
                    detail = flipped.json()["detail"]
                    assert "CRM is part of ERP" in detail and "ERP includes CRM" in detail
                    # Mutual types may go both ways (two different facts).
                    assert (await client.post(url, json=body("depends_on", crm, erp))).status_code == 201
                    assert (await client.post(url, json=body("depends_on", erp, crm))).status_code == 201
            finally:
                app.dependency_overrides.clear()
        finally:
            await _cleanup(engine, org, user)

    asyncio.run(go())


@pg
def test_owner_team_reads_owns_and_legacy_manages_rows_still_count():
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.models.people import PeopleAccountability, Team
    from app.services.owner_accountability_sync import sync_owner_team_accountability
    from app.services.people import load_accountabilities, load_entity_accountabilities

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                finance = Team(workspace_id=ws, org_id=org, name="Finance")
                ops = Team(workspace_id=ws, org_id=org, name="Ops")
                db.add_all([finance, ops])
                await db.flush()
                new_app = await _obj(db, org, ws, "application", "Ledger", owner_team_id=finance.id)
                old_app = await _obj(db, org, ws, "application", "Payroll", owner_team_id=ops.id)
                # An owner row written by an older sync: "manages".
                db.add(PeopleAccountability(workspace_id=ws, org_id=org, subject_type="team", subject_id=ops.id, entity_kind="application", entity_id=old_app.id, link_kind="manages"))
                await sync_owner_team_accountability(db, workspace_id=ws, org_id=org, entity=new_app, previous_team_id=None, team_id=finance.id)
                # Re-saving the legacy owner adds nothing.
                await sync_owner_team_accountability(db, workspace_id=ws, org_id=org, entity=old_app, previous_team_id=ops.id, team_id=ops.id)
                await db.commit()

                kinds = (await db.execute(select(PeopleAccountability.link_kind, PeopleAccountability.entity_id).where(PeopleAccountability.workspace_id == ws))).all()
                assert sorted((k, str(e)) for k, e in kinds) == sorted([("owns", str(new_app.id)), ("manages", str(old_app.id))])

                ledger = await load_entity_accountabilities(db, ws, org, "application", new_app.id)
                assert [(a.subject_name, a.link_kind, a.is_owner) for a in ledger] == [("Finance", "owns", True)]
                payroll = await load_entity_accountabilities(db, ws, org, "application", old_app.id)
                assert [(a.subject_name, a.link_kind, a.is_owner) for a in payroll] == [("Ops", "manages", True)]
                team_side = await load_accountabilities(db, ws, org, "team", ops.id)
                assert [(a.entity_name, a.is_owner) for a in team_side] == [("Payroll", True)]

                # Changing owner removes the previous team's legacy owner row and writes owns.
                old_app.owner_team_id = finance.id
                await sync_owner_team_accountability(db, workspace_id=ws, org_id=org, entity=old_app, previous_team_id=ops.id, team_id=finance.id)
                await db.commit()
                payroll = await load_entity_accountabilities(db, ws, org, "application", old_app.id)
                assert [(a.subject_name, a.link_kind, a.is_owner) for a in payroll] == [("Finance", "owns", True)]
        finally:
            await _cleanup(engine, org, user)

    asyncio.run(go())
