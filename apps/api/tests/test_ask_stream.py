"""Ask step 2: POST /ai/ask/stream protocol (meta, step, delta, final, error, done)."""
import asyncio
import json

from app.ai.ask import loop
from app.ai.ask import stream as st
from app.ai.ask.tools import ToolBag, run_tool
from tests.test_ask_engine import CTX, GOOD, _call_response, _text_response, engine, renewal_graph  # noqa: F401

RENEW = {"type": "application", "metric": "sum_annual_cost", "filters": {"renewal_within_days": 90}}


def parse(frames: list[str]) -> list[tuple[str, object]]:
    out = []
    for raw in frames:
        if raw.startswith(":"):
            out.append(("ping", None))
            continue
        lines = dict(line.split(": ", 1) for line in raw.strip().split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def run(gen) -> list[tuple[str, object]]:
    async def collect():
        return [f async for f in gen]

    return parse(asyncio.run(collect()))


def test_order_steps_live_then_checked_deltas_then_final_then_done(engine):  # noqa: F811
    engine([_call_response("aggregate", RENEW), _text_response(GOOD)])
    events = run(st.stream_ask(None, CTX, "What renews in the next 90 days?"))
    kinds = [k for k, _ in events]
    assert kinds[0] == "meta" and kinds[-1] == "done" and kinds.count("done") == 1
    assert kinds.count("final") == 1
    first_delta = kinds.index("delta")
    assert kinds.index("step") < first_delta < kinds.index("final")
    assert all(k == "step" for k in kinds[1:first_delta])
    text = "".join(d["text"] for k, d in events if k == "delta")
    final = dict(events)["final"]
    assert text == final["answer_text"] == GOOD["answer_markdown"]
    assert [s["id"] for s in final["steps"]] == ["estate", "tool-1", "check-1"]


def test_text_that_fails_the_check_never_streams(engine):  # noqa: F811
    bad = {**GOOD, "answer_markdown": "99 Applications renew [1]."}
    engine([_call_response("aggregate", RENEW), _text_response(bad), _text_response(bad)])
    events = run(st.stream_ask(None, CTX, "What renews in the next 90 days?"))
    assert not [k for k, _ in events if k == "delta"]
    assert dict(events)["final"]["source"] == "fallback"
    assert "99" not in json.dumps([d for k, d in events if k != "final"])
    assert events[-1][0] == "done"


def test_done_is_last_on_model_error_and_timeout(engine, monkeypatch):  # noqa: F811
    engine([RuntimeError("boom")])
    events = run(st.stream_ask(None, CTX, "What renews?"))
    assert dict(events)["final"]["fallback_reason"] == "model_error" and events[-1][0] == "done"
    engine([TimeoutError()])
    events = run(st.stream_ask(None, CTX, "What renews?"))
    assert dict(events)["final"]["fallback_reason"] == "timeout" and events[-1][0] == "done"


def test_engine_crash_sends_error_then_done():
    async def broken():
        yield {"event": "step", "data": {"id": "estate", "status": "done", "label": "x"}}
        raise RuntimeError("db gone")

    kinds = [k for k, _ in run(st.ask_events(broken()))]
    assert kinds == ["meta", "step", "error", "done"]


def test_pings_while_the_model_thinks():
    async def slow():
        await asyncio.sleep(0.05)
        yield {"event": "final", "data": {"source": "fallback", "fallback_reason": "x"}}

    kinds = [k for k, _ in run(st.ask_events(slow(), ping_seconds=0.01))]
    assert kinds[0] == "meta" and "ping" in kinds and kinds[-2:] == ["final", "done"]


def test_graph_passed_in_skips_the_db(engine, monkeypatch):  # noqa: F811
    engine([_call_response("aggregate", RENEW), _text_response(GOOD)])

    async def no_db(*a, **k):
        raise AssertionError("must not load from the DB inside the stream")

    monkeypatch.setattr(loop, "load_graph", no_db)
    events = run(st.stream_ask(None, CTX, "What renews in the next 90 days?", graph=renewal_graph()))
    assert dict(events)["final"]["source"] == "llm"


def test_chunks_rejoin_exactly():
    text = "6 Applications renew  in the next 90 days [1].\nSalesforce [2] is the largest."
    assert "".join(st.chunks(text, 3)) == text
    assert st.chunks("") == []


def test_vendor_grouping_spans_the_estate_like_the_header():
    bag = ToolBag(graph=renewal_graph(), seen_ids=set(), numbers=set())
    result = run_tool(bag, "aggregate", {"type": "application", "group_by": "vendor"})
    assert result["by_type"].get("On-prem server") == 1  # the server is included even when asked for apps
