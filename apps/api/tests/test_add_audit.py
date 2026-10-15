"""Everything the Add flow collects, saved through the real batch endpoint in the same four calls the web
makes (Ask cards, step 2 AI features, step 3 where each lives, step 4 owners/renewals/licences/cost), then
read back through the catalog loader the detail page uses (GET /catalog minus its Firestore cache). The payloads in fixtures/add_audit_steps.json are what
the web helpers build. With ADD_AUDIT_WRITE=1 the read-back is written to the web fixture that the detail and
edit render tests use. Needs ERASE_TEST_DATABASE_URL (a migrated scratch Postgres)."""
import asyncio
import json
import os
import pathlib
import uuid

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")
STEPS = json.loads((pathlib.Path(__file__).parent / "fixtures" / "add_audit_steps.json").read_text())
WEB_FIXTURE = pathlib.Path(__file__).parents[2] / "web" / "lib" / "setup" / "__fixtures__" / "add-audit-saved.json"


def _resolve(value, ids):
    if isinstance(value, str) and value.startswith("$id:"):
        return ids[value[4:]]
    if isinstance(value, list):
        return [_resolve(v, ids) for v in value]
    if isinstance(value, dict):
        return {k: _resolve(v, ids) for k, v in value.items()}
    return value


def test_steps_cover_every_add_question():
    card = {c["name"]: c["properties"] for c in STEPS["card"]["creates"]}
    assert card["Slack"]["hosting_model"] == "saas" and card["Slack"]["vendor"] and card["Slack"]["catalog_tool"]
    assert card["Payroll Tool"] == {"is_custom_built": True, "hosting_model": "own_cloud"}
    assert STEPS["card"]["relationships"][0]["attributes"] == {"region_key": "azure:canadaeast"}
    assert STEPS["where"]["creates"][0]["name"] == "SRV-01"
    assert STEPS["ai"]["updates"][0]["properties"]["ai_features"][0]["status"] == "on"
    assert {u["point_of_contact_name"] for u in STEPS["owners"]["updates"]} == {"Dana Lee", "Raj Patel", "Mo Khan"}


@pg
def test_add_flow_every_field_reads_back():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        async with AsyncSession(engine, expire_on_commit=False) as db:
            await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"h-{tag}@example.com"})
            await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'aud', :s)"), {"o": org, "s": "aud-" + tag})
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
        app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"h-{tag}@example.com", email_verified=True)
        base = f"/api/v1/orgs/aud-{tag}/workspaces/default"
        ids: dict[str, str] = {}
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
                for step in ("card", "where", "ai", "owners"):
                    res = await client.post(f"{base}/objects/batch", json=_resolve(STEPS[step], ids))
                    assert res.status_code == 200, (step, res.text)
                    ids.update({o["name"]: o["id"] for o in res.json()["objects"] if o["type"] == "application"})
                one = await client.get(f"{base}/objects/{ids['Payroll Tool']}")
                assert one.status_code == 200
            # What GET /catalog serves (its Firestore cache is skipped; same loader).
            from app.services.catalog_cache import _load
            async with AsyncSession(engine, expire_on_commit=False) as db:
                saved = json.loads(json.dumps(await _load(db, ws, org), default=str))
        finally:
            app.dependency_overrides.clear()
            await engine.dispose()
        return saved, ids

    saved, ids = asyncio.run(go())
    objects = {o["id"]: o for o in saved["objects"]}
    by_name = {o["name"]: o for o in saved["objects"]}
    slack, payroll, clock = by_name["Slack"], by_name["Payroll Tool"], by_name["Time Clock"]
    # Ask cards
    assert slack["properties"]["vendor"] == "Salesforce" and slack["properties"]["category"] == "Productivity"
    assert slack["properties"]["hosting_model"] == "saas"
    assert payroll["properties"]["hosting_model"] == "own_cloud" and payroll["properties"]["is_custom_built"] is True
    rels = saved["relationships"]
    tenant_link = next(r for r in rels if r["type"] == "runs_on" and r["from_object_id"] == payroll["id"])
    assert objects[tenant_link["to_object_id"]]["name"] == "Contoso Azure"
    assert (tenant_link.get("attributes") or {}).get("region_key") == "azure:canadaeast"
    # step 3
    assert clock["properties"]["hosting_model"] == "on_premise"
    srv_link = next(r for r in rels if r["type"] == "runs_on" and r["from_object_id"] == clock["id"])
    assert objects[srv_link["to_object_id"]]["name"] == "SRV-01"
    # step 2
    assert [(f["key"], f["status"], f["audience"]) for f in slack["properties"]["ai_features"]] == [("slack-ai", "on", "everyone")]
    # step 4
    for app_obj, renewal, seats, person in ((slack, "2027-03-31", 120, "Dana Lee"), (payroll, "2027-06-30", 40, "Raj Patel"), (clock, "2027-09-30", 15, "Mo Khan")):
        assert app_obj["properties"]["contract_renewal"] == renewal
        assert app_obj["properties"]["licence_count"] == seats
        assert app_obj.get("owner_team_id") or app_obj.get("owner") == "IT Ops", app_obj
        assert app_obj.get("point_of_contact_name") == person or app_obj.get("point_of_contact_id"), app_obj
    lines = slack["properties"]["cost_lines"]
    assert any(l["calculation"].get("seats") == 120 and l["calculation"].get("unit_price_monthly_cents") == 875 for l in lines)
    if os.getenv("ADD_AUDIT_WRITE"):
        WEB_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        keep = {o["id"] for o in saved["objects"]}
        WEB_FIXTURE.write_text(json.dumps({"objects": saved["objects"], "relationships": [r for r in rels if r["from_object_id"] in keep], "teams": saved.get("teams", []), "people": saved.get("people", [])}, indent=1, default=str) + "\n")
