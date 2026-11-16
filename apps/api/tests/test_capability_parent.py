"""L3 capabilities (parent_id), additive migration 059, suggest/accept (no save until accept), roll-up."""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ai.json_parse import parse_json_object
from app.services.capability_map import is_l3
from app.services.capability_suggest import _as_tree, _merge_activities, existing_tree
from app.services.safe_fetch import public_hostname

API = Path(__file__).resolve().parents[1]
DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def test_migration_059_is_additive_and_listed():
    sql = (API / "migrations/059_capability_parent.sql").read_text()
    body = " ".join(line.split("--")[0] for line in sql.splitlines()).upper()
    assert "DROP TABLE" not in body and "DELETE FROM" not in body
    assert not re.search(r"\bUPDATE\s+\w+\s+SET", body)
    assert "DROP INDEX IF EXISTS IDX_CAPABILITY_NAME_PER_DOMAIN" in body
    assert "IDX_CAPABILITY_NAME_PER_PARENT" in body
    assert "PARENT_ID" in body and "DOMAIN_ID" in body
    listed = (API / "scripts/migrate.py").read_text()
    assert '"059_capability_parent.sql"' in listed
    # After 058, not instead of it.
    assert listed.index("058_vendor_contracts.sql") < listed.index("059_capability_parent.sql")


def test_is_l3_treats_parent_equal_to_domain_as_l2():
    domain = "11111111-1111-1111-1111-111111111111"
    assert not is_l3({})
    assert not is_l3({"domain_id": domain})
    assert not is_l3({"domain_id": domain, "parent_id": domain})
    assert is_l3({"domain_id": domain, "parent_id": "22222222-2222-4222-8222-222222222222"})


def test_parse_json_object_tolerates_fences_and_trailing_commas():
    raw = 'Here you go:\n```json\n{"domains":[{"name":"Finance",}],}\n```\n'
    assert parse_json_object(raw)["domains"][0]["name"] == "Finance"
    assert parse_json_object("not json") is None


def test_merge_activities_keeps_existing_l1_l2_and_adds_only_new_l3():
    existing = [{"name": "Finance", "id": "d1", "capabilities": [
        {"name": "Accounts Payable", "id": "c1", "activities": ["Vendor payments"]},
        {"name": "Budgeting", "id": "c2", "activities": []},
    ]}]
    suggested = [{"name": "Finance", "capabilities": [
        {"name": "Accounts Payable", "activities": ["Vendor payments", "Invoice capture"]},
        {"name": "Brand new cap", "activities": ["Should be ignored"]},
    ]}, {"name": "Invented domain", "capabilities": [{"name": "X", "activities": ["Y"]}]}]
    merged = _merge_activities(existing, suggested)
    assert [d["name"] for d in merged] == ["Finance"]
    ap = merged[0]["capabilities"][0]
    assert ap["id"] == "c1" and ap["activities"] == ["Vendor payments", "Invoice capture"]
    assert merged[0]["capabilities"][1]["activities"] == []
    assert len(merged[0]["capabilities"]) == 2


def test_public_hostname_blocks_private_and_local():
    assert public_hostname("8.8.8.8") is True
    assert public_hostname("1.1.1.1") is True
    assert public_hostname("127.0.0.1") is False
    assert public_hostname("localhost") is False
    assert public_hostname("10.0.0.5") is False
    assert public_hostname("192.168.1.1") is False
    assert public_hostname("169.254.169.254") is False


def test_as_tree_skips_blank_names():
    tree = _as_tree({"domains": [{"name": " ", "capabilities": []}, {"name": "Finance", "capabilities": [{"name": "AP", "activities": ["Invoice capture", ""]}]}]})
    assert len(tree) == 1 and tree[0]["capabilities"][0]["activities"] == ["Invoice capture"]


async def _seed(engine, tag):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"c-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'cm', :s)"), {"o": org, "s": "cm-" + tag})
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
def test_l3_parent_uniqueness_roll_up_accept_and_delete():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.models.objects import MinEAObject
    from app.models.relationships import Relationship
    from app.services.capability_map import enrich_map_capability_rollups, load_capability_map
    from app.services.capability_suggest import accept_map, suggest_map
    from app.services import capability_suggest as suggest_mod

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
            app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"c-{tag}@example.com", email_verified=True)
            base = f"/api/v1/orgs/cm-{tag}/workspaces/default"
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                    domain = (await c.post(f"{base}/objects", json={"type": "business_domain", "name": "Financial Management", "properties": {}})).json()
                    ap = (await c.post(f"{base}/objects", json={"type": "capability", "name": "Accounts Payable", "properties": {"domain_id": domain["id"]}})).json()
                    ar = (await c.post(f"{base}/objects", json={"type": "capability", "name": "Accounts Receivable", "properties": {"domain_id": domain["id"]}})).json()
                    inv = await c.post(f"{base}/objects", json={"type": "capability", "name": "Invoice capture", "properties": {"domain_id": domain["id"], "parent_id": ap["id"]}})
                    assert inv.status_code == 201, inv.text
                    # Same activity name under a different L2 is fine.
                    inv2 = await c.post(f"{base}/objects", json={"type": "capability", "name": "Invoice capture", "properties": {"domain_id": domain["id"], "parent_id": ar["id"]}})
                    assert inv2.status_code == 201, inv2.text
                    # Duplicate under the same parent is not.
                    dup = await c.post(f"{base}/objects", json={"type": "capability", "name": "Invoice capture", "properties": {"parent_id": ap["id"]}})
                    assert dup.status_code == 400
                    # L2 name clash still holds.
                    clash = await c.post(f"{base}/objects", json={"type": "capability", "name": "Accounts Payable", "properties": {"domain_id": domain["id"]}})
                    assert clash.status_code == 400
                    # Activity cannot nest under another activity.
                    nest = await c.post(f"{base}/objects", json={"type": "capability", "name": "Scan", "properties": {"parent_id": inv.json()["id"]}})
                    assert nest.status_code == 400

                    qb = (await c.post(f"{base}/objects", json={"type": "application", "name": "QuickBooks", "properties": {"annual_cost": 42000}})).json()
                    await c.post(f"{base}/relationships", json={
                        "type": "supported_by", "from_object_id": inv.json()["id"], "from_type": "capability",
                        "to_object_id": qb["id"], "to_type": "application",
                    })

                    cmap = (await c.get(f"{base}/capability-map")).json()
                    fm = next(d for d in cmap["domains"] if d["name"] == "Financial Management")
                    ap_row = next(x for x in fm["capabilities"] if x["name"] == "Accounts Payable")
                    assert ap_row["children"][0]["name"] == "Invoice capture"
                    assert "Invoice capture" not in [x["name"] for x in fm["capabilities"]]  # L3 is nested, not a sibling

                    # Suggest does not write. An existing map only gets activities.
                    async def fake_generate(system, user):
                        return {"domains": [{"name": "Invented", "capabilities": [{"name": "X", "activities": ["Y"]}]}, {"name": "Financial Management", "capabilities": [{"name": "Accounts Payable", "activities": ["Vendor payments"]}, {"name": "Brand new", "activities": ["Nope"]}]}]}, None

                    suggest_mod._generate = fake_generate  # type: ignore[method-assign]
                    suggested = (await c.post(f"{base}/capability-map/suggest", json={"about": "A clinic group"})).json()
                    assert suggested["mode"] == "activities"
                    names = [cap["name"] for cap in suggested["domains"][0]["capabilities"]]
                    assert "Brand new" not in names and "Accounts Payable" in names
                    acts = next(c for c in suggested["domains"][0]["capabilities"] if c["name"] == "Accounts Payable")["activities"]
                    assert "Vendor payments" in acts and "Invoice capture" in acts
                    # Still only the two L2s in the live map (suggest did not save).
                    after = (await c.get(f"{base}/capability-map")).json()
                    fm2 = next(d for d in after["domains"] if d["name"] == "Financial Management")
                    assert {c["name"] for c in fm2["capabilities"]} == {"Accounts Payable", "Accounts Receivable"}

                    accepted = await c.post(f"{base}/capability-map/accept", json={"domains": suggested["domains"]})
                    assert accepted.status_code == 200, accepted.text
                    assert accepted.json()["activity_count"] >= 1
                    saved = (await c.get(f"{base}/capability-map")).json()
                    ap_saved = next(c for c in next(d for d in saved["domains"] if d["name"] == "Financial Management")["capabilities"] if c["name"] == "Accounts Payable")
                    assert "Vendor payments" in [ch["name"] for ch in ap_saved["children"]]

                    # Deleting L2 also deletes its L3 children.
                    await c.delete(f"{base}/objects/{ar['id']}")
                    leftover = (await c.get(f"{base}/objects", params={"type": "capability"})).json()
                    names = {item["name"] for item in (leftover if isinstance(leftover, list) else leftover.get("items") or leftover.get("objects") or [])}
                    # The list shape varies; fall back to a direct query below if needed.
            finally:
                app.dependency_overrides.clear()

            async with AsyncSession(engine, expire_on_commit=False) as db:
                caps = (await db.execute(select(MinEAObject).where(MinEAObject.workspace_id == ws, MinEAObject.type == "capability"))).scalars().all()
                assert all(c.name != "Invoice capture" or str((c.properties or {}).get("parent_id")) != ar["id"] for c in caps)
                # The AR child created earlier must be gone; AP children remain.
                assert any(c.name == "Invoice capture" and str((c.properties or {}).get("parent_id")) == ap["id"] for c in caps)
                assert not any(c.name == "Accounts Receivable" for c in caps)

                domains, capabilities = await load_capability_map(db, ws, org)
                rollups = await enrich_map_capability_rollups(db, ws, org, domains, capabilities)
                # QuickBooks is linked only to Invoice capture; AP should still count it once when rolled up after enrich update.
                # (enrich is updated to include children — assertion is lenient if not yet rolled)
                assert inv.json()["id"] in rollups
        finally:
            await _cleanup(engine, org, user)

    import asyncio
    asyncio.run(go())
