"""Ask step 1: engine as an event stream (run_ask), real working steps, and a time budget that
ends well inside the web proxy's 30 s. POST /ai/ask keeps its JSON contract (plus `steps`)."""
import asyncio
import json
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from google.genai import types

from app.ai.ask import loop
from app.ai.ask import steps as st
from app.ai.ask.graph import Rec, WorkspaceGraph
from app.ai.ask.tools import ToolBag, run_tool

TODAY = date.today()


def rec(rid, name, *, raw_type="application", type_="application", kind="Application", annual=None, renewal=None, criticality=None, blank=None):
    return Rec(
        id=rid, raw_type=raw_type, type=type_, name=name, kind=kind, owner_team=None, owner_person=None,
        vendor=None, vendor_names=[], annual=annual, cost_note=None, renewal=renewal, lifecycle=None,
        criticality=criticality, blank=list(blank or []),
    )


def renewal_graph() -> WorkspaceGraph:
    records = {}
    # 14 apps with renewal dates: 6 inside 90 days, 8 later. Plus 2 apps without a date and 1 server.
    for i in range(6):
        records[f"a{i}"] = rec(f"a{i}", f"Soon {i}", annual=10000 * (i + 1), renewal=(TODAY + timedelta(days=10 + i * 10)).isoformat())
    for i in range(8):
        records[f"b{i}"] = rec(f"b{i}", f"Later {i}", annual=5000, renewal=(TODAY + timedelta(days=200 + i)).isoformat())
    records["n1"] = rec("n1", "No date 1", blank=["renewal_date"])
    records["n2"] = rec("n2", "No date 2", blank=["renewal_date", "owner"])
    records["s1"] = rec("s1", "Server 1", raw_type="server", type_="infrastructure", kind="On-prem server", blank=["owner"])
    return WorkspaceGraph(records=records, edges=[])


def bag(graph=None) -> ToolBag:
    return ToolBag(graph=graph or renewal_graph(), seen_ids=set(), numbers=set())


# ── step summaries from real tool results ───────────────────────────────────


def test_renewal_step_has_real_counts_and_cost():
    args = {"type": "application", "metric": "sum_annual_cost", "filters": {"renewal_within_days": 90}}
    result = run_tool(bag(), "aggregate", args)
    s = st.tool_step(1, "aggregate", args, result)
    assert s["label"] == "Found 14 with renewal dates; 6 Applications renew in the next 90 days, $210,000 a year"
    assert s["counts"] == {"count": 6, "with_renewal_date": 14, "annual_cost": 210000}
    assert s["status"] == "done" and s["tool"] == "aggregate"


def test_renewal_count_is_grounded_for_the_model():
    b = bag()
    run_tool(b, "aggregate", {"type": "application", "filters": {"renewal_within_days": 90}})
    assert "14" in b.numbers  # the model may say "14 have renewal dates" without failing the check


def test_nothing_renews():
    args = {"type": "application", "filters": {"renewal_within_days": 3}}
    s = st.tool_step(1, "aggregate", args, run_tool(bag(), "aggregate", args))
    assert s["label"] == "Found 14 with renewal dates; nothing renews in the next 3 days"


def test_gaps_step_names_types():
    s = st.tool_step(2, "find_gaps", {"field": "owner"}, run_tool(bag(), "find_gaps", {"field": "owner"}))
    assert s["label"] == "1 Application and 1 On-prem server have no owner"
    assert s["counts"] == {"count": 2}


def test_search_and_impact_steps():
    g = renewal_graph()
    one = st.tool_step(1, "search_records", {"text": "Soon 3"}, run_tool(bag(g), "search_records", {"text": "Soon 3"}))
    assert one["label"] == "Matched “Soon 3” to Soon 3 (Application)"
    many = st.tool_step(1, "search_records", {"text": "Later"}, run_tool(bag(g), "search_records", {"text": "Later"}))
    assert many["label"] == "Found 8 Applications matching “Later”"
    more = st.tool_step(1, "search_records", {"text": "e"}, run_tool(bag(g), "search_records", {"text": "e"}))
    assert more["label"] == "Found 11 items matching “e”"  # more matches than the 8 returned: total, no type split
    none = st.tool_step(1, "search_records", {"text": "zzz"}, run_tool(bag(g), "search_records", {"text": "zzz"}))
    assert none["label"] == "No match for “zzz”"
    impact = st.tool_step(2, "impact_of", {"id": "a1"}, run_tool(bag(g), "impact_of", {"id": "a1"}))
    assert impact["label"] == "Nothing recorded depends on Soon 1"
    missing = st.tool_step(3, "impact_of", {"id": "nope"}, run_tool(bag(g), "impact_of", {"id": "nope"}))
    assert missing["status"] == "error"


def test_impact_label_with_dependents():
    result = {"target": {"name": "Okta"}, "affected": [{}] * 12, "counts": {"direct": 9, "critical_direct": 3, "loses_sign_in": 3},
              "by_type": {"Application": 10, "Capability": 2}}
    assert st.tool_step(1, "impact_of", {}, result)["label"] == (
        "10 Applications and 2 Capabilities depend on Okta (9 stop working, 3 can't sign in, 3 critical)"
    )


def test_vendor_sign_in_ai_and_odd_results():
    vendor = st.tool_step(1, "aggregate", {"group_by": "vendor", "metric": "sum_annual_cost"},
                          {"count": 5, "by_type": {"Application": 5}, "annual_cost": 1200, "groups": [{}, {}]})
    assert vendor["label"] == "Grouped 5 Applications by vendor: 2 vendors, $1,200 a year"
    sso = st.tool_step(1, "sign_in", {}, {"providers": [{}], "own_login_count": 2, "not_recorded_count": 7})
    assert sso["label"] == "1 sign-in provider; 2 with their own login; 7 with nothing recorded"
    ai = st.tool_step(1, "ai_landscape", {}, {"counts": {"features": 3, "agents": 1, "platforms_and_models": 2, "flags": 4},
                                               "spend": {"total_per_year": 36000}})
    assert ai["label"] == "Found 3 AI features, 1 AI Agent, 2 AI platforms and models; 4 risk flags; $36,000 a year"
    assert st.tool_step(1, "ai_landscape", {}, loop.NOT_AI)["label"].startswith("Skipped the AI lookup")
    assert st.tool_step(1, "mystery", {}, {"x": 1})["label"] == "Ran a lookup"
    assert st.tool_step(1, "aggregate", {}, {"count": "not a number"})["label"] == "Ran a lookup"  # never raises


def test_estate_step_and_plurals():
    assert st.estate_step(renewal_graph())["label"] == "Read your estate: 16 Applications and 1 On-prem server"
    assert st.estate_step(WorkspaceGraph(records={}, edges=[]))["counts"] == {"items": 0}
    assert st.plural("Capability", 2) == "Capabilities"
    assert st.plural("API", 2) == "APIs"
    assert st.plural("Application", 1) == "Application"


# ── engine: events, contract, budget ────────────────────────────────────────


def _reply(parts, finish="STOP"):
    """A real google-genai response, shaped like gemini-2.5-flash's: a thought part first."""
    thought = types.Part(text="Thinking about which lookup to use.", thought=True)
    return types.GenerateContentResponse(
        candidates=[types.Candidate(content=types.Content(role="model", parts=[thought, *parts]), finish_reason=finish)],
        usage_metadata=types.GenerateContentResponseUsageMetadata(candidates_token_count=40, thoughts_token_count=12),
    )


def _call_response(name, args):
    return _reply([types.Part(function_call=types.FunctionCall(name=name, args=args), thought_signature=b"sig")])


def _text_response(payload):
    return _reply([types.Part.from_text(text=json.dumps(payload))])


class FakeModels:
    def __init__(self, script, delay=0.0):
        self.script = list(script)
        self.calls = 0
        self.delay = delay

    async def generate_content(self, **kwargs):
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@pytest.fixture
def engine(monkeypatch):
    holder = {}

    def setup(script, graph=None, delay=0.0):
        models = FakeModels(script, delay)
        holder["models"] = models
        monkeypatch.setattr(loop, "is_configured", lambda: True)
        monkeypatch.setattr(loop, "model_name", lambda: "gemini-2.5-flash")
        monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))

        async def load(db, wid, oid):
            return graph or renewal_graph()

        monkeypatch.setattr(loop, "load_graph", load)
        return models

    return setup


CTX = SimpleNamespace(workspace=SimpleNamespace(id=uuid.uuid4()), org_id=uuid.uuid4())
OLD_KEYS = {"source", "fallback_reason", "answer_text", "citations", "gaps", "follow_ups", "tools_used"}
LLM_KEYS = OLD_KEYS | {"intent", "verdict", "evidence", "fix_actions", "unsupported"}

GOOD = {
    "answer_markdown": "6 Applications renew in the next 90 days [1].",
    "citations": [{"n": 1, "record_id": "a0", "relationship": "Renews soon"}],
    "follow_ups": ["What can we cancel?"],
}


def test_llm_answer_keeps_contract_and_adds_real_steps(engine):
    args = {"type": "application", "metric": "sum_annual_cost", "filters": {"renewal_within_days": 90}}
    engine([_call_response("aggregate", args), _text_response(GOOD)])
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["source"] == "llm"
    assert LLM_KEYS <= set(result)
    assert result["answer_text"] == GOOD["answer_markdown"]
    assert result["citations"][0]["record_id"] == "a0"
    labels = [s["label"] for s in result["steps"]]
    assert labels == [
        "Read your estate: 16 Applications and 1 On-prem server (all of it sent to the AI)",
        "Found 14 with renewal dates; 6 Applications renew in the next 90 days, $210,000 a year",
        "Checked every name and number against the lookups",
    ]
    assert "Reading your question" not in json.dumps(result)


def test_run_ask_yields_steps_then_exactly_one_final(engine):
    engine([_call_response("find_gaps", {"field": "owner"}), _text_response({**GOOD, "answer_markdown": "Two have no owner."})])

    async def collect():
        return [e async for e in loop.run_ask(None, CTX, "What has no owner?")]

    events = asyncio.run(collect())
    kinds = [e["event"] for e in events]
    assert kinds[-1] == "final" and kinds.count("final") == 1
    assert all(k == "step" for k in kinds[:-1])
    assert events[1]["data"]["label"] == "1 Application and 1 On-prem server have no owner"


def test_correction_round_shows_a_step(engine):
    bad = {**GOOD, "answer_markdown": "99 Applications renew [1]."}  # 99 is not from a lookup
    engine([_call_response("aggregate", {"filters": {"renewal_within_days": 90}}), _text_response(bad), _text_response(GOOD)])
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["source"] == "llm"
    assert "needed a correction" in result["steps"][2]["label"]


def test_model_error_falls_back_with_steps(engine):
    engine([RuntimeError("boom")])
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["source"] == "fallback" and result["fallback_reason"] == "model_error"
    assert OLD_KEYS <= set(result)
    assert result["steps"][0]["id"] == "estate"


def test_unconfigured_or_empty_returns_fallback_with_reason_step(monkeypatch):
    monkeypatch.setattr(loop, "is_configured", lambda: False)
    result = asyncio.run(loop.answer_with_model(None, CTX, "anything"))
    assert result["fallback_reason"] == "model_unavailable"
    assert [s["id"] for s in result["steps"]] == ["ai-reason"]
    assert "GOOGLE_API_KEY" in result["steps"][0]["label"] and "[reason: model_unavailable]" in result["steps"][0]["label"]
    assert asyncio.run(loop.answer_with_model(None, CTX, "   "))["fallback_reason"] == "empty"


def test_budget_constants_fit_the_30s_proxy():
    assert loop.TOTAL_BUDGET_SECONDS <= 25
    assert loop.CALL_TIMEOUT_SECONDS <= loop.TOTAL_BUDGET_SECONDS
    assert loop.MIN_CALL_WINDOW_SECONDS > 0


def test_slow_model_times_out_inside_the_budget(engine, monkeypatch):
    monkeypatch.setattr(loop, "TOTAL_BUDGET_SECONDS", 0.6)
    monkeypatch.setattr(loop, "CALL_TIMEOUT_SECONDS", 0.3)
    monkeypatch.setattr(loop, "MIN_CALL_WINDOW_SECONDS", 0.05)
    engine([_text_response(GOOD)] * 4, delay=5)
    import time

    t0 = time.monotonic()
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["fallback_reason"] == "timeout"
    assert time.monotonic() - t0 < 1.0


def test_no_model_call_started_with_too_little_time_left(engine):
    models = engine([_text_response(GOOD)])
    ticks = iter([0.0, 30.0])  # started, then the first budget check sees 30 s gone

    async def collect():
        return [e async for e in loop.run_ask(None, CTX, "What renews?", clock=lambda: next(ticks))]

    events = asyncio.run(collect())
    assert events[-1]["data"]["fallback_reason"] == "timeout"
    assert models.calls == 0


def test_each_call_gets_at_most_the_remaining_time(engine, monkeypatch):
    seen = []
    real = asyncio.wait_for

    async def spy(coro, timeout):
        seen.append(timeout)
        return await real(coro, timeout)

    monkeypatch.setattr(loop.asyncio, "wait_for", spy)
    engine([_call_response("aggregate", {"filters": {"renewal_within_days": 90}}), _text_response(GOOD)])
    ticks = iter([0.0, 0.0, 15.0, 15.0])

    async def collect():
        return [e async for e in loop.run_ask(None, CTX, "What renews in the next 90 days?", clock=lambda: next(ticks, 15.0))]

    asyncio.run(collect())
    assert seen[0] == loop.CALL_TIMEOUT_SECONDS
    assert seen[1] == pytest.approx(loop.TOTAL_BUDGET_SECONDS - 15.0)


def test_model_error_logs_and_shows_the_exact_exception(engine, caplog):
    class ClientError(Exception):
        code = 404

    engine([ClientError("models/gemini-x is not found for API version v1beta key=AIzaSyFAKEFAKEFAKEFAKE")])
    with caplog.at_level("ERROR"):
        result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["fallback_reason"] == "model_error"
    assert result["fallback_detail"].startswith("ClientError 404: models/gemini-x is not found")
    assert "AIza" not in json.dumps(result) and "[redacted]" in result["fallback_detail"]
    step = result["steps"][-1]
    assert step["id"] == "ai-reason" and step["status"] == "error" and "[reason: model_error]" in step["label"]
    assert any("ask model call failed" in r.message for r in caplog.records)


def test_timeout_has_reason_step(engine):
    engine([asyncio.TimeoutError()])
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["fallback_reason"] == "timeout"
    assert "[reason: timeout]" in result["steps"][-1]["label"]


def test_router_turns_a_crash_into_a_server_error_fallback():
    from app.routers import ai as ai_router

    payload = ai_router._server_error(RuntimeError("MissingGreenlet: greenlet_spawn has not been called"))
    assert payload["source"] == "fallback" and payload["fallback_reason"] == "server_error"
    assert "RuntimeError" in payload["fallback_detail"]
    assert "[reason: server_error]" in payload["steps"][0]["label"]


def test_owner_person_filter_matches_any_owner_name():
    from app.ai.ask.graph import Rec, WorkspaceGraph
    from app.ai.ask.tools import ToolBag, run_tool

    rec = Rec(id="a", raw_type="application", type="application", name="Payroll", kind="", owner_team="Finance", owner_person=None,
              vendor=None, vendor_names=[], annual=None, cost_note=None, renewal=None, lifecycle=None, criticality=None)
    graph = WorkspaceGraph(records={"a": rec}, edges=[], objects=[{"id": "a", "type": "application", "name": "Payroll", "owner": "Christine Wong", "properties": {"business_owner": "Sam Lee"}}])
    bag = ToolBag(graph=graph, seen_ids=set(), numbers=set())
    assert run_tool(bag, "filter_records", {"owner_person": "Christine"})["total"] == 1
    assert run_tool(bag, "filter_records", {"owner_person": "Sam"})["total"] == 1
    assert run_tool(bag, "filter_records", {"owner_person": "Zed"})["total"] == 0


def test_load_graph_survives_a_catalogue_rollback(monkeypatch):
    """load_tools rolls back when tool_catalog_entries is unreadable; that used to expire the rows
    already loaded, and reading them raised MissingGreenlet (a 500, shown as "AI unavailable")."""
    import os

    url = os.getenv("ERASE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("needs ERASE_TEST_DATABASE_URL")
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.ai.ask import graph as graph_mod

    async def broken(db):
        await db.rollback()
        return {}

    monkeypatch.setattr(graph_mod, "catalogue_vendors", broken)

    async def run():
        engine = create_async_engine(url)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                row = (await db.execute(text("SELECT workspace_id, org_id FROM objects LIMIT 1"))).first()
                if not row:
                    pytest.skip("no objects in the test database")
                graph = await graph_mod.load_graph(db, row[0], row[1])
                assert graph.objects
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_timing_on_the_final_and_one_log_line(engine, caplog):
    import logging
    from app.ai.ask.timing import AskTiming
    bad = {**GOOD, "answer_markdown": "99 Applications renew [1]."}
    engine([_call_response("aggregate", {"filters": {"renewal_within_days": 90}}), _text_response(bad), _text_response(GOOD)])
    timing = AskTiming()
    timing.add("auth", 0.05)
    with caplog.at_level(logging.INFO, logger="app.ai.ask.timing"):
        result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?", timing=timing))
    t = result["timing"]
    assert t["ai_calls"] == 3 and len(t["calls"]) == 3 and t["calls"][-1].get("correction") is True
    assert t["corrected"] is True and t["lookups"] == 1 and t["tools"][0]["name"] == "aggregate"
    assert t["context_chars"] > 0 and t["context_tokens_est"] == t["context_chars"] // 4
    assert {"auth_s", "context_s", "check_s", "total_s"} <= set(t) and t["outcome"] == "llm"
    assert t["summary"].startswith("Took ") and "AI 3 calls" in t["summary"] and "lookups" in t["summary"] and "check" in t["summary"]
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("ask timing ")]
    assert len(lines) == 1 and "ai_calls=3" in lines[0] and "corrected=True" in lines[0]
    # No behaviour change: the steps are the same as without timing.
    assert all(s["id"] != "timing" for s in result["steps"])


def test_timing_summary_format():
    from app.ai.ask.timing import AskTiming
    ticks = iter([0.0, 6.2])
    t = AskTiming(clock=lambda: next(ticks))
    t.phases = {"workspace": 0.2, "context": 0.1, "check": 0.1}
    t.calls = [{"s": 2.0, "in": 1, "out": 1, "think": 0, "finish": "STOP"}, {"s": 3.1, "in": 1, "out": 1, "think": 0, "finish": "STOP"}]
    t.tools = [{"name": "aggregate", "s": 0.2}]
    assert t.summary() == "Took 6.2s: workspace 0.3s · AI 2 calls 5.1s · lookups 0.2s · check 0.1s"
