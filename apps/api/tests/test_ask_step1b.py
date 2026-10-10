"""Ask step 1b: fixes from the live tunnel test of step 1.

1. A repeated identical lookup is shown once, and every step id is unique (two checks were both "check").
2. The renewal window's dates are given to the model and grounded, so writing them is not a failed check.
"""
import asyncio
from datetime import date, timedelta

from app.ai.ask import loop
from app.ai.ask import steps as st
from app.ai.ask.graph import WorkspaceGraph
from app.ai.ask.tools import ToolBag, run_tool
from tests.test_ask_engine import CTX, GOOD, _call_response, _text_response, engine  # noqa: F401

EMPTY = WorkspaceGraph(records={}, edges=[])
RENEW = {"type": "application", "filters": {"renewal_within_days": 90}}


def test_repeated_identical_lookup_is_shown_once(engine):  # noqa: F811
    nothing = {**GOOD, "answer_markdown": "Nothing renews in the next 90 days.", "citations": []}
    engine([_call_response("aggregate", RENEW), _call_response("aggregate", RENEW), _text_response(nothing)], graph=EMPTY)
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    labels = [s["label"] for s in result["steps"]]
    assert labels.count("Found 0 with renewal dates; nothing renews in the next 90 days") == 1
    assert result["tools_used"] == ["aggregate", "aggregate"]  # both ran; only the display is merged


def test_step_ids_are_unique_through_a_correction(engine):  # noqa: F811
    bad = {**GOOD, "answer_markdown": "99 Applications renew [1]."}
    engine([_call_response("aggregate", RENEW), _text_response(bad), _text_response(GOOD)])
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    ids = [s["id"] for s in result["steps"]]
    assert len(ids) == len(set(ids))
    assert ids[-2:] == ["check-1", "check-2"]


def test_different_lookups_are_all_shown(engine):  # noqa: F811
    engine([_call_response("aggregate", RENEW), _call_response("find_gaps", {"field": "owner"}), _text_response(GOOD)])
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert len([s for s in result["steps"] if s["id"].startswith("tool-")]) == 2


def test_same_step_helper():
    a = st.step("tool-1", "x", counts={"count": 0})
    assert st.same_step(a, st.step("tool-2", "x", counts={"count": 0}))
    assert not st.same_step(a, st.step("tool-2", "x", counts={"count": 1}))
    assert not st.same_step(None, a)


def test_renewal_window_dates_are_returned_and_grounded():
    bag = ToolBag(graph=EMPTY, seen_ids=set(), numbers=set())
    result = run_tool(bag, "aggregate", RENEW)
    start, end = date.today(), date.today() + timedelta(days=90)
    assert result["window"] == {"from": start.isoformat(), "to": end.isoformat()}
    for n in (start.year, start.month, start.day, end.year, end.month, end.day):
        assert str(n) in bag.numbers


def test_empty_estate_answer_naming_the_window_passes_the_check(engine):  # noqa: F811
    """The live false failure: on an empty estate the model explained the window with dates."""
    end = date.today() + timedelta(days=90)
    text = f"Nothing renews between today and {end.strftime('%B')} {end.day}, {end.year}; no renewal dates are recorded."
    engine([_call_response("aggregate", RENEW), _text_response({**GOOD, "answer_markdown": text, "citations": []})], graph=EMPTY)
    result = asyncio.run(loop.answer_with_model(None, CTX, "What renews in the next 90 days?"))
    assert result["source"] == "llm"
    labels = [s["label"] for s in result["steps"]]
    assert not any("needed a correction" in label for label in labels)
    assert labels[-1] == "Checked every name and number against the lookups"
