"""Per-role owners (Business / Technical / Support): pure rules, plus the API against a scratch Postgres."""
import asyncio
import os
import uuid
from types import SimpleNamespace

import pytest

from app.services.ownership_roles import ObjectRoles, RoleHolder, apply_bulk, is_owned, primary_role, roles_from_rows

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def _o(**kw):
    base = dict(owner=None, owner_team_id=None, point_of_contact_id=None, point_of_contact_name=None)
    return SimpleNamespace(**{**base, **kw})


def test_primary_is_business_owner_else_first_role_set():
    a, b = uuid.uuid4(), uuid.uuid4()
    assert primary_role({"technical_owner": RoleHolder(a), "business_owner": RoleHolder(b)}) == "business_owner"
    assert primary_role({"support_team": RoleHolder(a), "technical_owner": RoleHolder(None, b)}) == "technical_owner"
    assert primary_role({"business_owner": RoleHolder()}) is None


def test_existing_primary_owner_reads_as_business_owner():
    t = uuid.uuid4()
    roles = roles_from_rows(_o(owner="Finance", owner_team_id=t), [])
    assert roles.implicit and roles.roles["business_owner"].team_id == t


def test_unowned_means_nothing_at_all():
    assert not is_owned(_o(), ObjectRoles())
    assert is_owned(_o(owner="Old free text"), ObjectRoles())  # legacy text still counts
    assert is_owned(_o(), ObjectRoles(roles={"support_team": RoleHolder(uuid.uuid4())}))


def test_bulk_assign_move_remove():
    t1, t2, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    start = ObjectRoles(roles={"business_owner": RoleHolder(t1, c), "support_team": RoleHolder(t1)})
    assigned = apply_bulk(start, action="assign", role="technical_owner", subject_type="team", subject_id=t2)
    assert assigned["technical_owner"].team_id == t2 and assigned["business_owner"].team_id == t1
    moved = apply_bulk(start, action="move", role=None, subject_type="team", subject_id=t1, target_type="team", target_id=t2)
    assert moved["business_owner"] == RoleHolder(t2, c) and moved["support_team"] == RoleHolder(t2)
    one = apply_bulk(start, action="remove", role="support_team", subject_type="team", subject_id=t1)
    assert one["support_team"].empty() and one["business_owner"].team_id == t1
    gone = apply_bulk(start, action="remove", role=None, subject_type="contact", subject_id=c)
    assert gone["business_owner"] == RoleHolder(t1) and start.roles["business_owner"].contact_id == c


async def _seed(engine, tag):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"h-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'ow', :s)"), {"o": org, "s": "ow-" + tag})
        await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
        await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
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
def test_bulk_flow_syncs_primary_owner_and_audits():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.models.objects import MinEAObject
    from app.models.people import PeopleContact, Team

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                fin = Team(workspace_id=ws, org_id=org, name="Finance")
                ops = Team(workspace_id=ws, org_id=org, name="Platform")
                db.add_all([fin, ops])
                await db.flush()
                ana = PeopleContact(workspace_id=ws, org_id=org, name="Ana Ruiz", email="ana@x.io", team_id=ops.id)
                db.add(ana)
                await db.flush()
                objs = {}
                for name, kind, extra in [
                    ("CRM", "application", {"properties": {"category": "Sales"}}),
                    ("ERP", "application", {"owner": "Finance", "owner_team_id": fin.id}),
                    ("Legacy", "application", {"owner": "Old Dept"}),
                    ("Billing", "capability", {}),
                ]:
                    o = MinEAObject(workspace_id=ws, org_id=org, type=kind, name=name, **{"properties": {}, **extra})
                    db.add(o)
                    objs[name] = o
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
                    r = await c.get(base + "/ownership")
                    assert r.status_code == 200, r.text
                    by = {i["name"]: i for i in r.json()["items"]}
                    assert r.json()["unowned_count"] == 2  # CRM, Billing
                    assert by["ERP"]["roles"]["business_owner"]["team_name"] == "Finance"
                    assert by["Legacy"]["owned"] and by["Legacy"]["legacy_owner"] == "Old Dept"
                    assert by["CRM"]["category"] == "Sales"

                    # Lead shows as the contact when only a team is set.
                    r = await c.put(f"{base}/people/teams/{ops.id}", json={"lead_contact_id": str(ana.id)})
                    assert r.status_code == 200, r.text
                    assert r.json()["lead_contact_id"] == str(ana.id)

                    ids = [str(objs["CRM"].id), str(objs["ERP"].id)]
                    r = await c.post(base + "/ownership/bulk", json={"action": "assign", "object_ids": ids, "role": "technical_owner", "owner": {"type": "team", "id": str(ops.id)}})
                    assert r.json() == {"changed": 2}, r.text
                    by = {i["name"]: i for i in (await c.get(base + "/ownership")).json()["items"]}
                    tech = by["CRM"]["roles"]["technical_owner"]
                    assert tech["team_name"] == "Platform" and tech["contact_name"] == "Ana Ruiz" and tech["contact_is_lead"]
                    assert by["ERP"]["roles"]["business_owner"]["team_name"] == "Finance"  # implicit kept

                    # A bad id anywhere rolls the whole batch back.
                    r = await c.post(base + "/ownership/bulk", json={"action": "assign", "object_ids": [str(objs["Billing"].id), str(uuid.uuid4())], "role": "support_team", "owner": {"type": "team", "id": str(ops.id)}})
                    assert r.status_code == 404

                    r = await c.post(base + "/ownership/bulk", json={"action": "move", "object_ids": ids, "owner": {"type": "team", "id": str(ops.id)}, "target": {"type": "team", "id": str(fin.id)}})
                    assert r.json() == {"changed": 2}
                    r = await c.post(base + "/ownership/bulk", json={"action": "remove", "object_ids": [str(objs["ERP"].id)], "role": "business_owner", "owner": {"type": "team", "id": str(fin.id)}})
                    assert r.json() == {"changed": 1}

                    r = await c.put(f"{base}/ownership/objects/{objs['Billing'].id}", json={"roles": {"support_team": {"contact_id": str(ana.id)}}})
                    assert r.status_code == 200 and r.json()["owned"], r.text

                    # Deleting a team takes it off every role and re-syncs the primary.
                    assert (await c.delete(f"{base}/people/teams/{fin.id}")).status_code in (200, 204)
                    data = (await c.get(base + "/ownership")).json()
                    assert data["unowned_count"] == 2  # CRM and ERP lost their only owner
            finally:
                app.dependency_overrides.clear()

            async with AsyncSession(engine) as db:
                erp = await db.get(MinEAObject, objs["ERP"].id)
                billing = await db.get(MinEAObject, objs["Billing"].id)
                assert erp.owner_team_id is None and erp.owner is None
                assert billing.point_of_contact_id == ana.id  # first role set becomes the primary
                actions = (await db.execute(text("SELECT action FROM audit_log WHERE org_id = :o ORDER BY created_at"), {"o": org})).scalars().all()
                assert actions.count("ownership.assign") == 1 and "ownership.move" in actions and "ownership.remove" in actions and "ownership.set" in actions
                logs = (await db.execute(text("SELECT count(*) FROM change_log WHERE org_id = :o AND object_id = :e"), {"o": org, "e": objs["CRM"].id})).scalar()
                assert logs >= 2
        finally:
            await _cleanup(engine, org, user)

    asyncio.run(go())
