"""Ask step 3: rich answers built from lookup results (summary, table, chart)."""
import asyncio
from dataclasses import replace
from datetime import date, timedelta

from app.ai.ask import loop
from app.ai.ask.graph import WorkspaceGraph
from app.ai.ask.tools import ToolBag, run_tool
from tests.test_ask_engine import CTX, _call_response, _text_response, engine  # noqa: F401
from tests.test_ask_step2b import VENDORS, sample


def test_vendor_table_and_chart_cover_every_vendor():
    bag = ToolBag(graph=sample(), seen_ids=set(), numbers=set())
    run_tool(bag, "aggregate", VENDORS)
    blocks = loop.rich_blocks(bag)
    rows = blocks["table"]["rows"]
    assert blocks["table"]["kind"] == "vendors" and len(rows) == 6
    assert rows[0] == {"label": "Salesforce", "value": "$18,000 a year", "detail": "Salesforce", "record_id": "1"}
    assert rows[4] == {"label": "Seagull", "value": "No annual cost recorded", "detail": "BarTender", "record_id": "7"}
    assert [b["label"] for b in blocks["chart"]["bars"]] == ["Salesforce", "Microsoft", "Intuit", "Shopify"]


def test_renewals_table_and_chart_by_month():
    g = sample()
    soon = date.today() + timedelta(days=10)
    later = date.today() + timedelta(days=60)
    recs = dict(g.records)
    recs["1"] = replace(recs["1"], renewal=soon.isoformat())
    recs["3"] = replace(recs["3"], renewal=later.isoformat())
    bag = ToolBag(graph=WorkspaceGraph(records=recs, edges=[]), seen_ids=set(), numbers=set())
    run_tool(bag, "aggregate", {"metric": "sum_annual_cost", "filters": {"renewal_within_days": 90}})
    blocks = loop.rich_blocks(bag)
    assert blocks["table"]["kind"] == "renewals"
    assert [r["label"] for r in blocks["table"]["rows"]] == ["Salesforce", "Microsoft 365"]
    assert "renews" in blocks["table"]["rows"][0]["detail"]
    assert sum(b["value"] for b in blocks["chart"]["bars"]) == 33000


def test_no_blocks_without_a_list_lookup():
    assert loop.rich_blocks(ToolBag(graph=sample(), seen_ids=set(), numbers=set())) == {}


def test_summary_is_the_first_sentence():
    assert loop.summary_of("You use **6 vendors** [1]. Salesforce is largest.") == "You use 6 vendors."
    assert loop.summary_of("$1.5 million is spent. More.") == "$1.5 million is spent."


def test_final_payload_carries_summary_table_chart(engine):  # noqa: F811
    answer = {"answer_markdown": "You use 6 vendors. Salesforce is the largest at $18,000 a year.", "citations": [], "follow_ups": ["What can we cancel?"]}
    engine([_call_response("aggregate", VENDORS), _text_response(answer)], graph=sample())
    result = asyncio.run(loop.answer_with_model(None, CTX, "Which vendors do we spend the most with?"))
    assert result["summary"] == "You use 6 vendors."
    assert len(result["table"]["rows"]) == 6 and result["chart"]["title"] == "Spend by vendor"
