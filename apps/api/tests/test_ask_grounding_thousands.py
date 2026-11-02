"""Costs in the workspace text ("$156,000/yr") ground an answer that quotes them, without item_ids."""
from app.ai.ask.context import build_context
from app.ai.ask.grounding import graph_numbers, harvest
from app.ai.ask.loop import _UUID, _validate, soften_numbers
from app.ai.ask.tools import ToolBag
from tests.test_ask_context import graph, obj


def test_harvest_reads_thousands_separators():
    out: set[str] = set()
    harvest("Sales Cloud | $180,000/yr | 1,200 licences | $1,234.50", out)
    assert {"180000", "1200", "1234.5"} <= out
    assert "180" not in out


def test_answer_quoting_a_workspace_cost_passes_without_item_ids():
    sf = obj("application", "Sales Cloud", {"vendor": "Salesforce", "annual_cost": 180000})
    m365 = obj("application", "Microsoft 365", {"vendor": "Microsoft", "annual_cost": 156000, "licence_count": 1200})
    g = graph(sf, m365)
    bag = ToolBag(graph=g, seen_ids=set(g.records), numbers=set())
    graph_numbers(g, bag.numbers)
    harvest(_UUID.sub(" ", build_context(g)), bag.numbers)
    answer = {
        "headline": "Sales Cloud is your biggest cost at $180,000 a year.",
        "answer_markdown": "Sales Cloud costs $180,000/yr [1], then Microsoft 365 at $156,000/yr [2].",
        "citations": [{"n": 1, "record_id": str(sf.id)}, {"n": 2, "record_id": str(m365.id)}],
        "item_ids": [],
    }
    question = "what do we spend the most on?"
    assert _validate(answer, bag, question) is None
    # A made-up cost is still caught.
    bad = {**answer, "answer_markdown": "Sales Cloud costs $190,000/yr [1].", "citations": answer["citations"][:1]}
    assert _validate(bad, bag, question) == "ungrounded_number"
    assert soften_numbers({**bad, "headline": ""}, bag, question)[0] is None
