"""'what is not owned by CRM?': filter operators (is_not, empty, not_empty, contains, any_of), the
negated-value guard, and 'CRM' resolving to the owner team."""
import asyncio
import uuid
from types import SimpleNamespace

from app.ai.ask import loop
from app.ai.ask.graph import Rec, WorkspaceGraph
from app.ai.ask.names import hint_prompt, name_hints
from app.ai.ask.record_filters import clean_filters
from app.ai.ask.tools import ToolBag, run_tool, tool_specs
from tests.test_ask_engine import FakeModels, _call_response, _text_response


def _rec(id, name, team=None, vendor=None):
    return Rec(id=id, raw_type="application", type="application", name=name, kind="", owner_team=team, owner_person=None,
               vendor=vendor, vendor_names=[vendor] if vendor else [], annual=None, cost_note=None, renewal=None, lifecycle=None, criticality=None)


def _graph():
    recs = [_rec("sf", "Salesforce", "CRM", "Salesforce"), _rec("hub", "HubSpot", "CRM", "HubSpot"), _rec("pay", "Payroll", "Finance", "ADP"),
            _rec("wiki", "Wiki", "IT"), _rec("old", "Old tool")]
    return WorkspaceGraph(records={r.id: r for r in recs}, edges=[], objects=[{"id": r.id, "type": "application", "name": r.name, "properties": {}} for r in recs])


def _ids(args):
    return sorted(item["id"] for item in run_tool(ToolBag(graph=_graph(), seen_ids=set(), numbers=set()), "filter_records", args)["items"])


def test_values_are_used_as_given():
    # No rewriting of the model's values: it picks the operator.
    assert clean_filters({"owner_team": "not CRM"}) == {"owner_team": "not CRM"}
    assert clean_filters({"owner_team": "CRM", "ops": {"owner_team": "is_not"}}) == {"owner_team": "CRM", "ops": {"owner_team": "is_not"}}


def test_operators():
    assert _ids({"owner_team": "CRM", "ops": {"owner_team": "is_not"}}) == ["old", "pay", "wiki"]
    assert _ids({"ops": {"owner_team": "is_empty"}}) == ["old"]
    assert _ids({"ops": {"owner_team": "is_not_empty"}}) == ["hub", "pay", "sf", "wiki"]
    assert _ids({"owner_team": "fin", "ops": {"owner_team": "contains"}}) == ["pay"]
    assert _ids({"owner_team": "CRM, IT", "ops": {"owner_team": "any_of"}}) == ["hub", "sf", "wiki"]
    assert _ids({"owner_team": ["Finance", "IT"]}) == ["pay", "wiki"]
    assert _ids({"owner_team": "CRM"}) == ["hub", "sf"]


def test_schema_offers_operators_neutrally():
    spec = next(t for t in tool_specs() if t["name"] == "filter_records")
    ops = spec["input_schema"]["properties"]["ops"]
    assert ops["properties"]["owner_team"]["enum"] == ["is", "is_not", "is_empty", "is_not_empty", "contains", "any_of"]
    assert "CRM" not in spec["description"] + ops["description"] and "CRM" not in loop.SYSTEM


def test_crm_resolves_to_the_owner_team():
    graph = _graph()
    graph.records["crmapp"] = _rec("crmapp", "CRM", None, "CRM")
    hints = name_hints("what is not owned by CRM?", graph)
    assert (hints[0].name, hints[0].kind) == ("CRM", "team")
    assert "owner team “CRM” (filter owner_team)" in hint_prompt(hints)


def test_not_owned_by_crm_with_the_fake_model(monkeypatch):
    answer = {"headline": "3 items aren't owned by CRM", "answer_markdown": "3 items are not owned by CRM [1].", "citations": [{"n": 1, "record_id": "pay", "relationship": ""}]}
    models = FakeModels([_call_response("filter_records", {"owner_team": "CRM", "ops": {"owner_team": "is_not"}}), _text_response(answer)])
    monkeypatch.setattr(loop, "is_configured", lambda: True)
    monkeypatch.setattr(loop, "model_name", lambda: "gemini-2.5-flash")
    monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))
    ctx = SimpleNamespace(workspace=SimpleNamespace(id=uuid.uuid4()), org_id=uuid.uuid4())

    async def collect():
        return [e async for e in loop.run_ask(None, ctx, "what is not owned by CRM?", graph=_graph())]

    final = asyncio.run(collect())[-1]["data"]
    assert final["source"] == "llm"
    assert final["filters"] == {"owner_team": "CRM", "ops": {"owner_team": "is_not"}}
    assert final["headline"] == "3 items aren't owned by CRM"


def test_headline_numbers_are_checked():
    from app.ai.ask.loop import _validate

    bag = ToolBag(graph=_graph(), seen_ids=set(), numbers=set())
    run_tool(bag, "filter_records", {"owner_team": "CRM", "ops": {"owner_team": "is_not"}})
    base = {"answer_markdown": "Payroll [1].", "citations": [{"n": 1, "record_id": "pay"}]}
    assert _validate({**base, "headline": "3 items aren't owned by CRM"}, bag, "q") is None
    assert _validate({**base, "headline": "47 items aren't owned by CRM"}, bag, "q") == "ungrounded_number"
