"""Ask grounding for AI (spec §8): the Python mirror of lib/ai/landscape.ts and the ai_landscape lookup."""

import asyncio
import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ai.ask import loop
from app.ai.ask.ai_landscape import CATALOG, JOB_LABELS, ai_landscape, summarize
from app.ai.ask.graph import Edge, WorkspaceGraph, _record
from app.ai.ask.loop import _validate
from app.ai.ask.tools import ToolBag, run_tool, search_records, tool_specs
from app.ai.gemini_client import build_gemini_tools

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "packages/types/src/fixtures/ai-landscape.fixture.json").read_text(encoding="utf-8"))


def _orm(obj: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id=obj["id"],
        type=obj["type"],
        name=obj["name"],
        status=obj.get("status"),
        owner=obj.get("owner"),
        owner_team_id=obj.get("owner_team_id"),
        point_of_contact_id=obj.get("point_of_contact_id"),
        point_of_contact_name=None,
        properties=obj.get("properties") or {},
        description="",
    )


def _graph(objects=None, relationships=None) -> WorkspaceGraph:
    objects = FIXTURE["objects"] if objects is None else objects
    relationships = FIXTURE["relationships"] if relationships is None else relationships
    records = {}
    for obj in objects:
        rec = _record(_orm(obj), {})
        records[rec.id] = rec
    edges = [Edge(rel["from_object_id"], rel["to_object_id"], rel["type"], "") for rel in relationships]
    return WorkspaceGraph(records=records, edges=edges, objects=objects)


def _bag(graph: WorkspaceGraph | None = None) -> ToolBag:
    return ToolBag(graph=graph or _graph(), seen_ids=set(), numbers=set())


def test_the_fixture_gives_the_same_output_as_typescript():
    assert summarize(FIXTURE["objects"], FIXTURE["relationships"]) == FIXTURE["expected"]


def test_the_catalog_copy_and_job_labels_match_packages_types():
    shared = json.loads((ROOT / "packages/types/src/ai-feature-catalog.json").read_text(encoding="utf-8"))
    assert CATALOG == shared
    source = (ROOT / "packages/types/src/index.ts").read_text(encoding="utf-8")
    block = source[source.index("export const AI_JOBS") :]
    block = block[: block.index("];")]
    pairs = dict(re.findall(r'value: "([a-z_]+)", label: "([^"]+)"', block))
    assert JOB_LABELS == pairs


def test_f6_titles_carry_the_group_size():
    feature = lambda key, name: {"key": key, "name": name, "status": "on", "sees_company_data": "no", "vendor_trains": "no"}
    m365 = {"id": "m", "type": "application", "name": "Microsoft 365", "status": "active", "properties": {"ai_features": [feature("m365-copilot", "Copilot"), feature("m365-copilot-chat", "Copilot Chat")]}}
    shop = {"id": "s", "type": "application", "name": "Shopify", "status": "active", "properties": {"ai_features": [feature("shopify-sidekick", "Sidekick")]}}
    [flag] = [flag for flag in ai_landscape([m365, shop], [])["flags"] if flag["id"] == "F6"]
    assert flag["title"] == "Three doing the same job"
    assert flag["why"] == "Copilot, Copilot Chat, Sidekick all do writing help."


def test_ai_landscape_lookup_returns_counts_flags_spend_and_notes_ids_and_numbers():
    bag = _bag()
    result = run_tool(bag, "ai_landscape", {})
    assert result["counts"] == {
        "places": 14,
        "features": 6,
        "agents": 4,
        "platforms_and_models": 4,
        "flags": 14,
        "high_flags": 9,
        "unreviewed": 4,
    }
    assert result["spend"]["total_per_year"] == 16980
    assert result["spend"]["per_seat_add_ons"] == 12900
    assert result["unreviewed_count"] == 4
    copilot = next(row for row in result["features"] if row["name"] == "Microsoft 365 Copilot")
    assert copilot["id"] == "app-m365" and copilot["type_label"] == "Application" and copilot["seats"] == 25
    invoice = next(row for row in result["agents"] if row["id"] == "agent-invoice")
    assert invoice["type_label"] == "AI Agent" and invoice["owner"] is None
    assert next(row for row in result["platforms"] if row["id"] == "model-claude")["type_label"] == "AI Model"
    f3 = [flag for flag in result["flags"] if flag["flag"] == "F3"]
    assert f3 == [{"flag": "F3", "severity": "high", "title": "Agent has no owner", "why": "Nobody is named as its owner.", "items": ["Invoice Reader"], "record_ids": ["agent-invoice"]}]
    assert {"app-m365", "agent-invoice", "agent-sales", "model-claude", "plat-copilot-studio"} <= bag.seen_ids
    assert "app-m365:m365-copilot" not in bag.seen_ids
    assert {"14", "9", "4", "16980", "16,980", "12,900", "25"} <= bag.numbers


def test_group_and_flag_narrow_the_lists_but_not_the_counts():
    result = run_tool(_bag(), "ai_landscape", {"group": "agents", "flag": "F4"})
    assert result["features"] == [] and result["platforms"] == []
    assert len(result["agents"]) == 4
    assert {flag["flag"] for flag in result["flags"]} == {"F4"}
    assert result["counts"]["flags"] == 14


def test_an_answer_built_from_the_lookup_passes_the_validator_and_a_made_up_number_fails():
    bag = _bag()
    run_tool(bag, "ai_landscape", {})
    answer = {
        "answer_markdown": "You use AI in **14** places [1]: 6 features, 4 agents and 4 AI platforms and models. Microsoft 365 Copilot can see mail and files for 25 people [2]. 14 flags (9 high), 4 unreviewed, $16,980 / yr. F1 is the biggest.",
        "intent": "ai",
        "citations": [
            {"n": 1, "record_id": "agent-invoice", "relationship": "Agent has no owner"},
            {"n": 2, "record_id": "app-m365", "relationship": "Microsoft 365 Copilot"},
        ],
        "follow_ups": ["Which agents have no owner?"],
    }
    assert _validate(answer, bag, "What AI do we use and what can it touch?") is None
    made_up = {**answer, "answer_markdown": answer["answer_markdown"].replace("$16,980", "$17,500")}
    assert _validate(made_up, bag, "What AI do we use and what can it touch?") == "ungrounded_number"


def test_agents_and_ai_models_are_searchable_with_their_type_labels():
    bag = _bag()
    found = search_records(bag, {"text": "invoice reader"})
    assert found["matches"][0]["id"] == "agent-invoice"
    assert found["matches"][0]["type_label"] == "AI Agent"
    assert search_records(bag, {"text": "claude"})["matches"][0]["type_label"] == "AI Model"


def test_digits_in_a_found_name_are_grounded_for_any_lookup():
    bag = _bag()
    found = search_records(bag, {"text": "microsoft 365"})
    assert found["matches"][0]["id"] == "app-m365"
    answer = {
        "answer_markdown": "Microsoft 365 is an Application [1].",
        "intent": "lookup",
        "citations": [{"n": 1, "record_id": "app-m365", "relationship": "Application"}],
        "follow_ups": ["What depends on Microsoft 365?"],
    }
    assert _validate(answer, bag, "What is our office suite?") is None
    assert _validate({**answer, "answer_markdown": "Microsoft 365 has 40 users [1]."}, bag, "What is our office suite?") == "ungrounded_number"


def test_the_lookup_is_declared_for_the_model():
    spec = next(item for item in tool_specs() if item["name"] == "ai_landscape")
    assert spec["description"].startswith("Everywhere AI is used: AI features in tools, AI agents, AI platforms and models, with risk flags F1–F6, total AI spend and unreviewed count. Use the numbers as given.")
    assert spec["input_schema"]["properties"]["flag"]["enum"] == ["F1", "F2", "F3", "F4", "F5", "F6"]
    assert build_gemini_tools(tool_specs())  # builds offline, no key needed
    assert "ai_landscape" in loop.SYSTEM
    assert "ai_landscape" in loop._STRATEGY["strategyPrompt"]


class _FakeModels:
    """Scripted model: first asks for ai_landscape, then answers from its numbers."""

    def __init__(self):
        self.calls = 0
        self.seen_tool_result = None

    async def generate_content(self, model, contents, config):
        self.calls += 1
        if self.calls == 1:
            call = SimpleNamespace(name="ai_landscape", args={})
            return SimpleNamespace(function_calls=[call], text="", candidates=[])
        last = contents[-1].parts[0].function_response.response["result"]
        self.seen_tool_result = last
        counts = last["counts"]
        body = {
            "answer_markdown": f"You use AI in **{counts['places']}** places: {counts['features']} features, {counts['agents']} agents and {counts['platforms_and_models']} AI platforms and models [1]. {counts['flags']} flags ({counts['high_flags']} high).",
            "intent": "ai",
            "citations": [{"n": 1, "record_id": "agent-invoice", "relationship": "Agent has no owner"}],
            "follow_ups": ["Which agents have no owner?"],
        }
        return SimpleNamespace(function_calls=[], text=json.dumps(body), candidates=[])


def test_the_ask_loop_calls_ai_landscape_without_a_real_model(monkeypatch):
    fake = _FakeModels()
    graph = _graph()

    async def fake_graph(db, workspace_id, org_id):
        return graph

    monkeypatch.setattr(loop, "is_configured", lambda: True)
    monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=fake)))
    monkeypatch.setattr(loop, "model_name", lambda: "fake")
    monkeypatch.setattr(loop, "load_graph", fake_graph)
    ctx = SimpleNamespace(workspace=SimpleNamespace(id="w"), org_id="o")
    result = asyncio.run(loop.answer_with_model(None, ctx, "What AI do we use and what can it touch?"))
    assert result["source"] == "llm", result
    assert result["tools_used"] == ["ai_landscape"]
    assert result["intent"] == "ai"
    assert result["citations"][0]["type_label"] == "AI Agent"
    assert "14" in result["answer_text"]
