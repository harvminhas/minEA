"""Vendor contracts: cost split overlay (no double counting), the 058 migration, API, Ask graph and workspace copy."""
import asyncio
import os
import pathlib
import re
import uuid

import pytest

from app.services.contracts import contract_shares, covering_by_object, effective_properties
from app.services.cost_lines import object_annual_dollars

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")
API = pathlib.Path(__file__).resolve().parents[1]


def _c(cost, items, **kw):
    return {"id": kw.pop("id", "k1"), "vendor_name": "Microsoft", "annual_cost_cents": cost, "items": items, **kw}


def test_split_by_seats_when_every_app_has_seats_else_evenly():
    assert contract_shares(_c(100_000, [{"object_id": "a", "seats": 300}, {"object_id": "b", "seats": 100}])) == {"a": 75_000, "b": 25_000}
    assert contract_shares(_c(100_000, [{"object_id": "a", "seats": 300}, {"object_id": "b"}, {"object_id": "c"}])) == {"a": 33_333, "b": 33_333, "c": 33_334}
    assert contract_shares(_c(None, [{"object_id": "a"}])) == {}
    assert contract_shares(_c(5, [])) == {}


def test_contract_counts_once_across_its_apps():
    contract = _c(48_000_000, [{"object_id": "a", "seats": 400, "in_use": 380}, {"object_id": "b", "seats": 400, "in_use": 120}], end_date="2027-03-01")
    own = {"annual_cost": 99999, "cost_lines": [
        {"type": "subscription", "frequency": "annual", "amount_cents": 9_999_900, "calculation": {"kind": "flat"}},
        {"type": "internal_estimate", "frequency": "annual", "amount_cents": 500, "calculation": {"kind": "flat"}},
        {"type": "implementation", "frequency": "one_time", "amount_cents": 700, "calculation": {"kind": "flat"}, "one_time_date": "2024-01-01"},
    ], "licence_count": 10, "contract_renewal": "2030-01-01"}
    cover = covering_by_object([contract])
    a = effective_properties(own, cover["a"], "a")
    b = effective_properties({}, cover["b"], "b")
    total = object_annual_dollars(a) + object_annual_dollars(b)
    assert total == 480_000  # the contract, once; the app's own subscription line is replaced
    assert a["annual_cost"] == 240_000 and a["licence_count"] == 400 and a["licences_in_use"] == 380
    assert a["contract_renewal"] == "2027-03-01"
    kinds = [line["type"] for line in a["cost_lines"]]
    assert kinds == ["subscription", "internal_estimate", "implementation"]
    assert own["annual_cost"] == 99999  # input untouched


def test_app_without_contract_or_cost_keeps_its_own_fields():
    own = {"annual_cost": 1200, "licence_count": 50, "contract_renewal": "2026-12-01"}
    assert effective_properties(own, [], "x") == own
    no_cost = effective_properties(own, [_c(None, [{"object_id": "x", "in_use": 7}], end_date="2026-11-01")], "x")
    assert no_cost["annual_cost"] == 1200 and no_cost["licence_count"] == 50
    assert no_cost["licences_in_use"] == 7 and no_cost["contract_renewal"] == "2026-11-01"


def test_migration_is_additive_and_listed():
    sql = (API / "migrations/058_vendor_contracts.sql").read_text()
    body = re.sub(r"--.*", "", sql).upper()
    assert "DROP " not in body and "ALTER " not in body and "DELETE FROM" not in body and not re.search(r"\bUPDATE\s+\w+\s+SET", body)
    assert "CREATE TABLE IF NOT EXISTS VENDOR_CONTRACTS" in body
    assert '"058_vendor_contracts.sql"' in (API / "scripts/migrate.py").read_text()


async def _seed(engine, tag):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"v-{tag}@example.com"})
        await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'vc', :s)"), {"o": org, "s": "vc-" + tag})
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
def test_contract_api_ask_graph_copy_and_erase():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.ai.ask.graph import load_graph, workspace_fingerprint
    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.models.contracts import VendorContract, VendorContractItem
    from app.models.objects import MinEAObject, Workspace
    from app.models.people import PeopleContact
    from app.services.workspace_copy import copy_workspace_layers

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = await _seed(engine, tag)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                ms = MinEAObject(workspace_id=ws, org_id=org, type="external_party", name="Microsoft", properties={})
                m365 = MinEAObject(workspace_id=ws, org_id=org, type="application", name="Microsoft 365", properties={"annual_cost": 999999, "licence_count": 5})
                teams = MinEAObject(workspace_id=ws, org_id=org, type="application", name="Teams", properties={})
                other = MinEAObject(workspace_id=ws, org_id=org, type="application", name="Slack", properties={"annual_cost": 1000})
                db.add_all([ms, m365, teams, other])
                await db.flush()
                ana = PeopleContact(workspace_id=ws, org_id=org, name="Ana Ruiz", email="ana@x.io")
                db.add(ana)
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
            app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"v-{tag}@example.com", email_verified=True)
            base = f"/api/v1/orgs/vc-{tag}/workspaces/default/contracts"
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                    r = await c.post(base, json={
                        "vendor_id": str(ms.id), "annual_cost_cents": 48_000_000, "start_date": "2024-03-01", "end_date": "2027-03-01",
                        "notice_days": 90, "auto_renew": True, "owner_contact_id": str(ana.id), "document_url": "https://docs/ea.pdf",
                        "items": [{"object_id": str(m365.id), "seats": 400, "in_use": 380}],
                    })
                    assert r.status_code == 201, r.text
                    k = r.json()
                    assert k["name"] == "Microsoft contract" and k["vendor_name"] == "Microsoft" and len(k["items"]) == 1
                    r = await c.put(f"{base}/{k['id']}/items/{teams.id}", json={"seats": 400, "in_use": 120})
                    assert r.status_code == 200 and len(r.json()["items"]) == 2
                    r = await c.patch(f"{base}/{k['id']}", json={"start_date": "2028-01-01"})
                    assert r.status_code == 400  # end before start
                    r = await c.post(base, json={"vendor_id": str(m365.id)})
                    assert r.status_code == 400  # an app is not a vendor
                    r = await c.post(base, json={"items": [{"object_id": str(uuid.uuid4())}]})
                    assert r.status_code == 400
                    listed = (await c.get(base)).json()
                    assert [x["id"] for x in listed] == [k["id"]]
            finally:
                app.dependency_overrides.clear()

            # Ask graph: the contract counts once, split by seats; Slack keeps its own cost.
            async with AsyncSession(engine, expire_on_commit=False) as db:
                fp1 = await workspace_fingerprint(db, ws, org)
                graph = await load_graph(db, ws, org)
                props = {o["name"]: o["properties"] for o in graph.objects}
                assert props["Microsoft 365"]["annual_cost"] == 240_000 and props["Teams"]["annual_cost"] == 240_000
                assert props["Microsoft 365"]["licence_count"] == 400 and props["Teams"]["licences_in_use"] == 120
                assert props["Slack"]["annual_cost"] == 1000
                row = await db.get(MinEAObject, m365.id)
                assert row.properties["annual_cost"] == 999999  # the stored record is never rewritten
                await db.execute(text("UPDATE vendor_contract_items SET in_use = 200 WHERE object_id = :o"), {"o": teams.id})
                await db.commit()
                assert await workspace_fingerprint(db, ws, org) != fp1

            # Workspace copy carries contracts with the application layer (vendor isn't copied).
            async with AsyncSession(engine, expire_on_commit=False) as db:
                target = Workspace(org_id=org, name="Copy", slug="copy-" + tag)
                db.add(target)
                await db.flush()
                source = await db.get(Workspace, ws)
                await copy_workspace_layers(db, source, target, ["application"], user)
                await db.commit()
                copied = (await db.execute(select(VendorContract).where(VendorContract.workspace_id == target.id))).scalars().all()
                assert len(copied) == 1 and copied[0].annual_cost_cents == 48_000_000 and copied[0].vendor_id is None
                items = (await db.execute(select(VendorContractItem).where(VendorContractItem.contract_id == copied[0].id))).scalars().all()
                assert len(items) == 2

            # Deleting an app drops it from the contract; deleting the vendor keeps the contract unlinked.
            async with AsyncSession(engine, expire_on_commit=False) as db:
                await db.execute(text("DELETE FROM objects WHERE id = :o"), {"o": teams.id})
                await db.execute(text("DELETE FROM objects WHERE id = :o"), {"o": ms.id})
                await db.commit()
                kept = (await db.execute(select(VendorContract).where(VendorContract.workspace_id == ws))).scalars().one()
                assert kept.vendor_id is None
                n = (await db.execute(text("SELECT count(*) FROM vendor_contract_items WHERE contract_id = :k"), {"k": kept.id})).scalar()
                assert n == 1
        finally:
            await _cleanup(engine, org, user)
            async with AsyncSession(create_async_engine(DB_URL)) as db:
                left = (await db.execute(text("SELECT count(*) FROM vendor_contracts WHERE org_id = :o"), {"o": org})).scalar()
                assert left == 0  # user erase deletes the org, which cascades

    asyncio.run(go())
