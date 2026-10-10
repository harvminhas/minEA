"""Ask step 2b: one vendor definition end to end, no false check on vendor answers, paced text."""
import asyncio
import time

from app.ai.ask import loop
from app.ai.ask import stream as st
from app.ai.ask.graph import Rec, WorkspaceGraph
from app.ai.ask.tools import ToolBag, run_tool
from tests.test_ask_engine import CTX, _call_response, _text_response, engine  # noqa: F401


def rec(rid, name, vendor=None, annual=None, type_="application", raw="application", kind="Application"):
    return Rec(id=rid, raw_type=raw, type=type_, name=name, kind=kind, owner_team=None, owner_person=None, vendor=vendor,
               vendor_names=[vendor] if vendor else [], annual=annual, cost_note=None, renewal=None, lifecycle=None, criticality=None, blank=[])


def sample() -> WorkspaceGraph:
    """The QA sample: 7 apps, 1 server with no vendor recorded (IBM is only a suggestion)."""
    rows = [
        rec("1", "Salesforce", "Salesforce", 18000), rec("2", "QuickBooks Online", "Intuit", 900),
        rec("3", "Microsoft 365", "Microsoft", 15000), rec("4", "Order Entry"), rec("5", "SPS Commerce", "SPS Commerce"),
        rec("6", "Shopify", "Shopify", 348), rec("7", "BarTender", "Seagull"),
        rec("8", "AS400", None, None, "infrastructure", "model", "On-prem server"),
    ]
    return WorkspaceGraph(records={r.id: r for r in rows}, edges=[])


VENDORS = {"group_by": "vendor", "metric": "sum_annual_cost", "top": 3}


def test_every_vendor_is_returned_whatever_top_says():
    bag = ToolBag(graph=sample(), seen_ids=set(), numbers=set())
    result = run_tool(bag, "aggregate", VENDORS)
    assert [g["key"] for g in result["groups"]] == ["Salesforce", "Microsoft", "Intuit", "Shopify", "Seagull", "SPS Commerce"]
    assert result["vendor_count"] == 6 and result["vendors_with_cost"] == 4 and result["vendor_spend_total"] == 34248
    for n in ("6", "4", "34248", "34,248", "99"):
        assert n in bag.numbers, n  # "$34,248 across 4 vendors", "99% goes to three": grounded, not a false failure


def test_vendor_step_says_six_like_the_header():
    from app.ai.ask import steps
    bag = ToolBag(graph=sample(), seen_ids=set(), numbers=set())
    label = steps.tool_step(1, "aggregate", VENDORS, run_tool(bag, "aggregate", VENDORS))["label"]
    assert "by vendor: 6 vendors" in label


def _bag_after_vendors():
    bag = ToolBag(graph=sample(), seen_ids=set(), numbers=set())
    run_tool(bag, "aggregate", VENDORS)
    return bag


def test_stated_vendor_count_must_equal_the_rows():
    bag = _bag_after_vendors()
    assert loop._vendor_count_problem("You use 6 vendors.", bag) is None
    assert loop._vendor_count_problem("You spend $34,248 a year across 4 vendors.", bag) == "vendor_count"
    assert loop._vendor_count_problem("You have six vendors; 99% goes to three vendors.", bag) is None
    assert loop._vendor_count_problem("The top 3 vendors take 99%.", bag) is None
    assert loop._vendor_count_problem("4 vendors", ToolBag(graph=sample(), seen_ids=set(), numbers=set())) is None  # no grouping ran


def test_final_carries_the_vendor_table(engine):  # noqa: F811
    answer = {"answer_markdown": "You use 6 vendors. Salesforce is the largest at $18,000 a year.", "citations": [], "follow_ups": ["What can we cancel?"]}
    engine([_call_response("aggregate", VENDORS), _text_response(answer)], graph=sample())
    result = asyncio.run(loop.answer_with_model(None, CTX, "Which vendors do we spend the most with?"))
    assert result["source"] == "llm"
    assert [r["vendor"] for r in result["vendor_table"]] == ["Salesforce", "Microsoft", "Intuit", "Shopify", "Seagull", "SPS Commerce"]
    assert result["vendor_table"][4]["names"] == ["BarTender"] and result["vendor_table"][4]["annual_cost"] is None
    assert not any("correction" in s["label"] for s in result["steps"])


def test_wrong_vendor_count_gets_one_correction(engine):  # noqa: F811
    bad = {"answer_markdown": "You spend $34,248 a year across 4 vendors.", "citations": [], "follow_ups": ["x"]}
    good = {**bad, "answer_markdown": "You spend $34,248 a year across 6 vendors; 2 have no cost recorded."}
    engine([_call_response("aggregate", VENDORS), _text_response(bad), _text_response(good)], graph=sample())
    result = asyncio.run(loop.answer_with_model(None, CTX, "Which vendors do we spend the most with?"))
    assert result["source"] == "llm" and "6 vendors" in result["answer_text"]


def test_text_chunks_are_paced():
    async def one():
        yield {"event": "final", "data": {"source": "llm", "answer_text": " ".join(["word"] * 30)}}

    async def collect():
        stamps = []
        async for f in st.ask_events(one(), delta_pause=0.02):
            if f.startswith("event: delta"):
                stamps.append(time.monotonic())
        return stamps

    stamps = asyncio.run(collect())
    assert len(stamps) == 5 and stamps[-1] - stamps[0] >= 0.07
