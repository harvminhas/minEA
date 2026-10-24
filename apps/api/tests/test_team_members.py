"""People & teams (057): team membership with titles, primary team kept in step, old roles retired."""
import asyncio
import os
import re
import uuid
from pathlib import Path

import pytest

from tests.test_ownership_roles import _cleanup, _seed

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")
MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "057_team_members.sql"


def test_migration_is_additive_only():
    sql = "\n".join(l for l in MIGRATION.read_text().upper().splitlines() if not l.startswith("--"))
    assert not re.search(r"^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b|ALTER COLUMN|RENAME|DROP ", sql, re.M)
    assert "CREATE TABLE IF NOT EXISTS TEAM_MEMBERS" in sql
    assert "ADD COLUMN IF NOT EXISTS RETIRED_AT" in sql
    assert "ON CONFLICT DO NOTHING" in sql


@pg
def test_members_primary_team_and_roles_review():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.services import people_directory

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
            app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"h-{tag}@example.com", email_verified=True)
            base = f"/api/v1/orgs/ow-{tag}/workspaces/default/people"
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                    fin = (await c.post(base + "/teams", json={"name": "Finance"})).json()["id"]
                    ops = (await c.post(base + "/teams", json={"name": "Platform"})).json()["id"]

                    # Create a person inline while adding them to a team; first team becomes primary.
                    r = await c.post(f"{base}/teams/{fin}/members", json={"name": " Maya  Chen ", "email": "maya@x.io", "title": "Controller"})
                    assert r.status_code == 201, r.text
                    maya = r.json()["contact_id"]
                    assert r.json()["name"] == "Maya Chen" and r.json()["title"] == "Controller"
                    r = await c.post(f"{base}/teams/{ops}/members", json={"contact_id": maya})
                    assert r.status_code == 201, r.text
                    p = (await c.get(f"{base}/contacts/{maya}")).json()
                    assert p["team_id"] == fin and [t["name"] for t in p["teams"]] == ["Finance", "Platform"]

                    # Title on a team, then leave the primary team: primary moves to the other membership.
                    assert (await c.patch(f"{base}/teams/{ops}/members/{maya}", json={"title": "SRE"})).status_code == 204
                    assert (await c.delete(f"{base}/teams/{fin}/members/{maya}")).status_code == 204
                    p = (await c.get(f"{base}/contacts/{maya}")).json()
                    assert p["team_id"] == ops and p["teams"] == [{"id": ops, "name": "Platform", "title": "SRE"}]
                    assert (await c.delete(f"{base}/teams/{fin}/members/{maya}")).status_code == 404

                    # Picking a lead makes them a member; detail lists members with titles.
                    leo = (await c.post(base + "/contacts", json={"name": "Leo", "title": "Head of Finance"})).json()
                    assert leo["title"] == "Head of Finance" and leo["teams"] == []
                    assert (await c.put(f"{base}/teams/{fin}", json={"lead_contact_id": leo["id"]})).status_code == 200
                    d = (await c.get(f"{base}/teams/{fin}")).json()
                    assert [m["name"] for m in d["members"]] == ["Leo"] and d["member_count"] == 1

                    # Older screens setting team_id are a move.
                    r = await c.put(f"{base}/contacts/{leo['id']}", json={"team_id": ops, "phone": "555"})
                    assert r.json()["phone"] == "555" and [t["name"] for t in r.json()["teams"]] == ["Platform"]

                    # Merging people keeps memberships and the lead.
                    dup = (await c.post(base + "/contacts", json={"name": "Maya C", "team_id": fin})).json()["id"]
                    async with AsyncSession(engine) as db:
                        await db.execute(text("UPDATE teams SET lead_contact_id = :d WHERE id = :t"), {"d": dup, "t": fin})
                        await db.commit()
                        await people_directory.merge(db, "person", ws, maya, [dup])
                    p = (await c.get(f"{base}/contacts/{maya}")).json()
                    assert sorted(t["name"] for t in p["teams"]) == ["Finance", "Platform"]
                    assert (await c.get(f"{base}/teams/{fin}")).json()["lead_contact_id"] == maya

                    # Old roles: no new writes; review turns one into a title, drops another; both hidden.
                    assert (await c.post(base + "/roles", json={"name": "X"})).status_code == 410
                    async with AsyncSession(engine) as db:
                        for name in ("Data steward", "Approver"):
                            await db.execute(text("INSERT INTO people_roles (workspace_id, org_id, name) VALUES (:w, :o, :n)"), {"w": ws, "o": org, "n": name})
                        await db.commit()
                    roles = {r["name"]: r["id"] for r in (await c.get(base + "/roles")).json()["items"]}
                    assert set(roles) == {"Data steward", "Approver"}
                    r = await c.post(f"{base}/roles/{roles['Data steward']}/retire", json={"title_contact_id": maya, "team_id": ops})
                    assert r.status_code == 204, r.text
                    assert (await c.post(f"{base}/roles/{roles['Approver']}/retire", json={})).status_code == 204
                    assert (await c.get(base + "/roles")).json()["items"] == []
                    assert len((await c.get(base + "/roles?include_retired=true")).json()["items"]) == 2
                    p = (await c.get(f"{base}/contacts/{maya}")).json()
                    assert {t["name"]: t["title"] for t in p["teams"]}["Platform"] == "Data steward"
                    async with AsyncSession(engine) as db:
                        assert (await people_directory.list_directory(db, ws))["roles"] == []

                    # Backfill: a primary team without a membership row (written before 057) is picked up,
                    # and re-running the migration changes nothing else.
                    async with AsyncSession(engine) as db:
                        await db.execute(text("DELETE FROM team_members WHERE contact_id = :c"), {"c": leo["id"]})
                        await db.commit()
                        for stmt in MIGRATION.read_text().split(";\n"):
                            body = "\n".join(line for line in stmt.splitlines() if not line.startswith("--")).strip()
                            if body:
                                await db.execute(text(body))
                        await db.commit()
                        n = await db.scalar(text("SELECT count(*) FROM team_members WHERE contact_id = :c AND team_id = :t"), {"c": leo["id"], "t": ops})
                        assert n == 1
            finally:
                app.dependency_overrides.clear()
        finally:
            await _cleanup(engine, org, user)

    asyncio.run(go())
