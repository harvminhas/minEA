"""Ask v2: filter_records over every Add field, vendor filter on aggregate, vendor-aware search,
and the per-org monthly AI-question allowance (counted server-side)."""
import asyncio
import os
import uuid
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.ai.ask.graph import Edge, Rec, WorkspaceGraph
from app.ai.ask.tools import ToolBag, run_tool
from app.services import ask_quota

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def _rec(id, name, type="application", vendor=None, team=None, annual=None, raw="application"):
    names = [vendor] if vendor else []
    return Rec(id=id, raw_type=raw, type=type, name=name, kind="", owner_team=team, owner_person=None, vendor=vendor,
               vendor_names=names, annual=annual, cost_note=None, renewal=None, lifecycle=None, criticality=None)


def _graph():
    recs = [
        _rec("m365", "Microsoft 365", vendor="Microsoft", team="IT Ops", annual=43200),
        _rec("pbi", "Power BI", vendor="Microsoft", team="Finance", annual=6000),
        _rec("ebs", "E-Business Suite", vendor="Oracle", team="Finance", annual=90000),
        _rec("tenant", "Contoso Azure", type="infrastructure", raw="cloud_service"),
        _rec("claims", "Claims Portal"),
        _rec("notes", "Field Notes", team="Ops"),
    ]
    props = {
        "m365": {"vendor": "Microsoft", "hosting_model": "saas"},
        "pbi": {"vendor": "Microsoft", "hosting_model": "saas"},
        "ebs": {"vendor": "Oracle", "hosting_model": "on_premise"},
        "tenant": {"platform_kind": "cloud_account", "vendor": "microsoft", "cloud_provider": "azure"},
        "claims": {"hosting_model": "own_cloud", "ai_features": [{"key": "a", "status": "on"}]},
        "notes": {"hosting_model": "own_cloud", "ai_features": [{"key": "b", "status": "on"}]},
    }
    objects = [{"id": r.id, "type": r.raw_type, "name": r.name, "properties": props[r.id]} for r in recs]
    edges = [
        Edge("claims", "tenant", "runs_on", "", {"region_key": "azure:canadacentral"}),
        Edge("notes", "tenant", "runs_on", "", {"region_key": "azure:canadaeast"}),
    ]
    return WorkspaceGraph(records={r.id: r for r in recs}, edges=edges, objects=objects)


def _bag():
    return ToolBag(graph=_graph(), seen_ids=set(), numbers=set())


def test_filter_records_vendor_includes_tenant_provider():
    bag = _bag()
    out = run_tool(bag, "filter_records", {"vendor": "microsoft"})
    assert sorted(i["name"] for i in out["items"]) == ["Contoso Azure", "Microsoft 365", "Power BI"]
    assert out["total"] == 3 and out["annual_cost_total"] == 49200
    assert bag.filters == {"vendor": "microsoft"}
    assert "49200" in bag.numbers and "3" in bag.numbers and {"m365", "pbi", "tenant"} <= bag.seen_ids


def test_filter_records_compound_and_hosting_words():
    out = run_tool(_bag(), "filter_records", {"provider": "Azure", "region": "Canada Central", "ai_on": True, "owner": "none"})
    assert [i["name"] for i in out["items"]] == ["Claims Portal"]
    assert out["items"][0]["regions"] == ["Canada Central"] and out["items"][0]["tenants"] == ["Contoso Azure"]
    assert [i["name"] for i in run_tool(_bag(), "filter_records", {"hosting": "our server"})["items"]] == ["E-Business Suite"]
    assert [i["name"] for i in run_tool(_bag(), "filter_records", {"owner_team": "finance", "cost_min": 10000})["items"]] == ["E-Business Suite"]
    assert run_tool(_bag(), "filter_records", {"vendor": "Zyxware"})["total"] == 0


def test_aggregate_vendor_filter_and_search_matches_vendor():
    out = run_tool(_bag(), "aggregate", {"type": "estate", "metric": "sum_annual_cost", "filters": {"vendor": "Microsoft"}})
    assert out["count"] == 3 and out["annual_cost"] == 49200
    found = run_tool(_bag(), "search_records", {"text": "oracle"})
    assert [m["name"] for m in found["matches"]] == ["E-Business Suite"]


def test_filter_records_is_offered_to_the_model():
    from app.ai.ask.loop import SYSTEM
    from app.ai.ask.tools import tool_specs

    assert "filter_records" in [t["name"] for t in tool_specs(include_ai=False)]
    assert "filter_records filters every kind of item by vendor" in SYSTEM


def test_month_is_eastern_and_limits_come_from_plans_json():
    late = datetime(2026, 10, 31, 23, 30, tzinfo=ZoneInfo("America/Toronto"))  # already Nov in UTC
    assert ask_quota.month_key(late) == "2026-10"
    assert ask_quota.PLAN_AI_QUESTIONS["free"] == 25 and ask_quota.PLAN_AI_QUESTIONS["starter"] == 500


def test_over_limit_returns_limit_fallback_without_calling_the_model(monkeypatch):
    from app.routers import ai as ai_router

    async def over(db, org_id, plan):
        return ask_quota.AskQuota(plan="free", used=25, limit=25, month="2026-10", allowed=False)

    class DB:
        async def commit(self):
            pass

    monkeypatch.setattr(ai_router, "is_configured", lambda: True)
    monkeypatch.setattr(ai_router, "take_question", over)
    ctx = SimpleNamespace(workspace=object(), org_id=uuid.uuid4(), org=SimpleNamespace(plan="free"))
    out = asyncio.run(ai_router._take_ai_question(DB(), ctx, "What Microsoft products do we own?"))
    assert out["source"] == "fallback" and out["fallback_reason"] == "limit"
    assert out["quota"] == {"plan": "free", "used": 25, "limit": 25, "month": "2026-10"}
    # No model configured: nothing is counted (the loop answers model_unavailable).
    monkeypatch.setattr(ai_router, "is_configured", lambda: False)
    assert asyncio.run(ai_router._take_ai_question(DB(), ctx, "x")) is None


@pg
def test_monthly_allowance_counts_per_org_and_month():
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    async def go():
        engine = create_async_engine(DB_URL)
        org, other = uuid.uuid4(), uuid.uuid4()
        oct_, nov = datetime(2026, 10, 15, tzinfo=ZoneInfo("America/Toronto")), datetime(2026, 11, 1, 0, 5, tzinfo=ZoneInfo("America/Toronto"))
        try:
            async with AsyncSession(engine) as db:
                await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'q', :s)"), {"o": org, "s": "q-" + org.hex[:8]})
                results = [await ask_quota.take_question(db, org, "free", oct_) for _ in range(26)]
                assert [q.allowed for q in results] == [True] * 25 + [False]
                assert results[24].used == 25 and results[25].used == 25
                assert (await ask_quota.take_question(db, other, "free", oct_)).used == 1  # per org
                assert (await ask_quota.take_question(db, org, "free", nov)).used == 1  # new month
                assert (await ask_quota.read_quota(db, org, "free", oct_)).used == 25
                # A Business org's own allowance (org_limits) wins over the plan default.
                await db.execute(text("INSERT INTO org_limits (org_id, limit_key, value) VALUES (:o, 'ai_questions_per_month', 26)"), {"o": org})
                assert (await ask_quota.take_question(db, org, "business", oct_)).allowed is True
                assert (await ask_quota.take_question(db, org, "business", oct_)).allowed is False
                await db.rollback()
        finally:
            await engine.dispose()

    asyncio.run(go())


@pg
def test_endpoint_enforces_the_allowance(monkeypatch):
    """Real POST /ai/ask and /ai/ask/stream: a Free org that used its 25 gets the limit fallback and the
    model is never called; usage is visible on GET /billing/status."""
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.routers import ai as ai_router

    def boom(*args, **kwargs):
        raise AssertionError("model must not be called over the limit")

    monkeypatch.setattr(ai_router, "is_configured", lambda: True)
    monkeypatch.setattr(ai_router, "answer_with_model", boom)
    monkeypatch.setattr(ai_router, "stream_ask", boom)

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        async with AsyncSession(engine) as db:
            await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"q-{tag}@example.com"})
            await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'q', :s)"), {"o": org, "s": "q-" + tag})
            await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
            await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
            await db.execute(text("INSERT INTO ai_question_usage (org_id, month, used) VALUES (:o, :m, 25)"), {"o": org, "m": ask_quota.month_key()})
            await db.commit()

        async def scratch_db():
            async with AsyncSession(engine, expire_on_commit=False) as session:
                yield session
                await session.commit()

        app.dependency_overrides[get_db] = scratch_db
        app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"q-{tag}@example.com", email_verified=True)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
                base = f"/api/v1/orgs/q-{tag}/workspaces/default/ai"
                res = await client.post(f"{base}/ask", json={"question": "What Microsoft products do we own?"})
                assert res.status_code == 200, res.text
                assert res.json()["fallback_reason"] == "limit" and res.json()["quota"]["limit"] == 25
                streamed = await client.post(f"{base}/ask/stream", json={"question": "What Oracle apps do we have?"})
                assert '"fallback_reason":"limit"' in streamed.text and "event: done" in streamed.text
                status = await client.get(f"/api/v1/orgs/q-{tag}/billing/status")
                assert status.status_code == 200, status.text
                assert (status.json()["ai_questions_used"], status.json()["ai_questions_limit"]) == (25, 25)
        finally:
            app.dependency_overrides.clear()
            await engine.dispose()

    asyncio.run(go())
