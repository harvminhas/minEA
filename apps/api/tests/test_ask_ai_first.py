"""AI-first Ask: name hints reach the model's prompt, yes_no and aggregate filters reach the card,
and every typed question counts once against the monthly allowance (fake model, no Gemini)."""
import asyncio
import json
import uuid
from types import SimpleNamespace

from app.ai.ask import loop
from app.ai.ask.graph import Rec, WorkspaceGraph
from app.ai.ask.names import hint_prompt, name_hints
from app.ai.ask.tools import ToolBag, run_tool
from app.services import ask_quota
from tests.test_ask_engine import FakeModels, _call_response, _text_response
from tests.test_ask_v2 import DB_URL, pg


def _rec(id, name, vendor=None, person=None, catalog_vendor=None):
    return Rec(id=id, raw_type="application", type="application", name=name, kind="", owner_team=None, owner_person=person,
               vendor=vendor, vendor_names=[vendor] if vendor else [], annual=None, cost_note=None, renewal=None, lifecycle=None,
               criticality=None, catalog_vendor=catalog_vendor)


def _graph():
    recs = [_rec("ps", "Adobe Photoshop", catalog_vendor="Adobe"), _rec("pay", "Payroll", person="Christine Wong"), _rec("crm", "Salesforce", vendor="Salesforce")]
    return WorkspaceGraph(records={r.id: r for r in recs}, edges=[], objects=[{"id": r.id, "type": "application", "name": r.name, "properties": {}} for r in recs])


def test_name_hints_fix_typos_and_first_names_only():
    hints = {(h.text, h.name, h.kind, h.how) for h in name_hints("Do we use Adboe? What does Christine own?", _graph())}
    assert ("adboe", "Adobe", "vendor", "typo") in hints
    assert ("christine", "Christine Wong", "person", "partial") in hints
    assert name_hints("what renews in the next 90 days?", _graph()) == []
    assert "spelling corrected" in hint_prompt(name_hints("do we use adboe", _graph()))


ANSWER = {"answer_markdown": "Yes — Adobe Photoshop [1].", "citations": [{"n": 1, "record_id": "ps", "relationship": ""}], "yes_no": "yes", "follow_ups": ["a?", "b?", "c?"]}


def test_hints_reach_the_prompt_and_yes_no_reaches_the_payload(monkeypatch):
    models = FakeModels([
        _call_response("filter_records", {"vendor": "Adobe"}),
        _text_response(ANSWER),
        _text_response(ANSWER),
    ])
    seen = []
    original = models.generate_content

    async def spy(**kwargs):
        seen.append(kwargs["contents"][0].parts[0].text)
        return await original(**kwargs)

    models.generate_content = spy
    monkeypatch.setattr(loop, "is_configured", lambda: True)
    monkeypatch.setattr(loop, "model_name", lambda: "gemini-2.5-flash")
    monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))
    ctx = SimpleNamespace(workspace=SimpleNamespace(id=uuid.uuid4()), org_id=uuid.uuid4())

    async def collect():
        return [e async for e in loop.run_ask(None, ctx, "do we use Adboe?", graph=_graph())]

    events = asyncio.run(collect())
    assert "“adboe” → vendor “Adobe” (spelling corrected)" in seen[0]
    assert any(e["event"] == "step" and e["data"]["label"].startswith("Matched names: adboe → Adobe") for e in events)
    final = events[-1]["data"]
    assert final["source"] == "llm" and final["yes_no"] == "yes" and final["filters"] == {"vendor": "Adobe"}


def test_aggregate_filters_become_card_filters():
    bag = ToolBag(graph=_graph(), seen_ids=set(), numbers=set())
    run_tool(bag, "aggregate", {"type": "estate", "metric": "count", "filters": {"vendor": "Adobe"}})
    assert bag.filters == {"vendor": "Adobe"}


@pg
def test_every_typed_question_counts_once(monkeypatch):
    """Real /ai/ask/stream with a fake engine: each typed question is one AI question this month."""
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.routers import ai as ai_router

    asked = []

    async def fake_stream(db, ctx, question, graph=None, context=None):
        asked.append(question)
        yield "event: final\ndata: " + json.dumps({"source": "llm", "answer_text": "ok"}) + "\n\n"

    monkeypatch.setattr(ai_router, "is_configured", lambda: True)
    monkeypatch.setattr(ai_router, "stream_ask", fake_stream)

    async def go():
        engine = create_async_engine(DB_URL)
        tag = uuid.uuid4().hex[:8]
        org, ws, user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        async with AsyncSession(engine) as db:
            await db.execute(text("INSERT INTO users (id, firebase_uid, email) VALUES (:u, :f, :e)"), {"u": user, "f": "fb-" + tag, "e": f"a-{tag}@example.com"})
            await db.execute(text("INSERT INTO orgs (id, name, slug) VALUES (:o, 'a', :s)"), {"o": org, "s": "a-" + tag})
            await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner')"), {"u": user, "o": org})
            await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug) VALUES (:w, :o, 'Default', 'default')"), {"w": ws, "o": org})
            await db.commit()

        async def scratch_db():
            async with AsyncSession(engine, expire_on_commit=False) as session:
                yield session
                await session.commit()

        app.dependency_overrides[get_db] = scratch_db
        app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + tag, email=f"a-{tag}@example.com", email_verified=True)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
                base = f"/api/v1/orgs/a-{tag}/workspaces/default/ai"
                for q in ["do we use Adboe?", "what is owned by Christine?"]:
                    res = await client.post(f"{base}/ask/stream", json={"question": q})
                    assert res.status_code == 200, res.text
                status = (await client.get(f"/api/v1/orgs/a-{tag}/billing/status")).json()
                assert status["ai_questions_used"] == 2 and asked == ["do we use Adboe?", "what is owned by Christine?"]
                assert ask_quota.month_key()
        finally:
            app.dependency_overrides.clear()
            await engine.dispose()

    asyncio.run(go())
