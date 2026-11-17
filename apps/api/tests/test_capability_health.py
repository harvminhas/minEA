"""Capability health lookup: Python tree matches the web fixture, and Ask uses the same numbers."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from app.ai.ask import steps
from app.ai.ask.capability_tree import build_capability_tree, is_activity, parse_link_fitness
from app.ai.ask.cio_views import overlaps
from app.ai.ask.graph import Edge, WorkspaceGraph, _record
from app.ai.ask.grounding import graph_numbers, harvest
from app.ai.ask.loop import SYSTEM, _validate
from app.ai.ask.tools import TOOLS, coverage_brief, is_coverage_question, run_tool, tool_specs
from app.ai.gemini_client import build_gemini_tools

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "packages/types/src/fixtures/capability-tree.fixture.json").read_text(encoding="utf-8"))
CIO = json.loads((ROOT / "packages/types/src/fixtures/cio-views.fixture.json").read_text(encoding="utf-8"))


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


def _graph(objects: list[dict], edges: list[dict]) -> WorkspaceGraph:
    records = {}
    for obj in objects:
        rec = _record(_orm(obj), {})
        records[rec.id] = rec
    graph_edges = [
        Edge(rel["from_object_id"], rel["to_object_id"], rel["type"], "", dict(rel.get("attributes") or {}))
        for rel in edges
    ]
    return WorkspaceGraph(records=records, edges=graph_edges, objects=objects)


def _bag(case_id: str = "finance"):
    case = next(item for item in FIXTURE["cases"] if item["id"] == case_id)
    from app.ai.ask.tools import ToolBag

    return ToolBag(graph=_graph(case["objects"], case["edges"]), seen_ids=set(), numbers=set()), case


def _by_id(rows: list[dict]) -> dict[str, dict]:
    return {row["id"]: row for row in rows}


def test_is_activity_and_fitness_rules():
    assert is_activity({"domain_id": "d", "parent_id": "d"}) is False
    assert is_activity({"domain_id": "d", "parent_id": "c"}) is True
    assert is_activity({}) is False
    assert parse_link_fitness(None) == "adequate"
    assert parse_link_fitness({}) == "adequate"
    assert parse_link_fitness({"fitness": "weak"}) == "weak"
    assert parse_link_fitness({"fitness": "none"}) == "none"


def test_the_shared_fixture_matches_the_web_tree():
    for case in FIXTURE["cases"]:
        assert build_capability_tree(case["objects"], case["edges"]) == case["expected"], case["id"]


def test_finance_roll_up_matches_the_heat_map():
    bag, case = _bag("finance")
    result = run_tool(bag, "capability_health", {})
    rows = _by_id(result["records"])
    inv, pay, ap, plan, fc, bud, tre, finance = (rows[key] for key in ("inv", "pay", "ap", "plan", "fc", "bud", "tre", "fin"))

    assert inv["coverage"] == "covered" and inv["fitness"] == "weak"
    assert inv["fitness_hint"] == "Epic on Invoice capture"
    assert inv["redundancy"] == "two" and inv["redundancy_apps"] == ["QuickBooks", "Epic"]
    assert inv["path_label"] == "Finance / Accounts Payable / Invoice capture"
    assert pay["fitness"] == "strong" and pay["redundancy"] == "none"
    assert ap["coverage"] == "covered" and ap["fitness"] == "weak"
    assert ap["unique_app_count"] == 3 and ap["annual_cost"] == 260000
    assert ap["redundancy_place"] == "Invoice capture"
    assert plan["coverage"] == "partial" and plan["fitness"] == "strong" and plan["redundancy"] == "none"
    assert plan["unique_app_count"] == 1  # Hyperion at two levels counts once
    assert fc["coverage"] == "gap" and fc["fitness"] == "none" and fc["redundancy"] == "gap"
    assert bud["fitness"] == "strong"
    assert tre["fitness"] == "adequate" and tre["redundancy"] == "none"
    assert finance["coverage"] == "mostly" and finance["fitness"] == "weak"
    assert finance["fitness_hint"] == "Epic on Invoice capture"
    assert finance["redundancy"] == "two"
    assert finance["unique_app_count"] == 5 and finance["annual_cost"] == 362000
    assert result["totals"]["annual_cost"] == 362000
    assert result["totals"]["unique_apps"] == 5
    assert "362000" in bag.numbers and "362,000" in bag.numbers
    assert "inv" in bag.seen_ids and "epic" in bag.seen_ids and "fin" in bag.seen_ids


def test_best_shape_is_full_coverage_then_fitness_then_no_redundancy():
    bag, _ = _bag("finance")
    result = run_tool(bag, "capability_health", {"level": "capability"})
    names = [row["name"] for row in result["best_shape"]]
    # Treasury: covered, adequate, no overlap. Accounts Payable: covered, weak, overlap. Planning: partial.
    assert names[0] == "Treasury"
    assert names[1] == "Accounts Payable"
    assert names[2] == "Financial Planning"
    assert "Full coverage first" in result["criteria"]["best_shape"]


def test_filters_level_and_domain():
    bag, _ = _bag("finance")
    acts = run_tool(bag, "capability_health", {"level": "activity"})
    assert {row["id"] for row in acts["records"]} == {"inv", "pay", "bud", "fc"}
    domain = run_tool(bag, "capability_health", {"domain": "Finance"})
    assert {row["id"] for row in domain["records"]} >= {"fin", "ap", "inv"}
    missing = run_tool(bag, "capability_health", {"domain": "Sales"})
    assert missing["records"] == []
    assert missing["totals"]["records"] == 0


def test_gaps_and_redundant_lists():
    bag, _ = _bag("finance")
    result = run_tool(bag, "capability_health", {})
    gap_ids = {row["id"] for row in result["gaps"]}
    assert "fc" in gap_ids and "plan" in gap_ids  # gap and partial
    assert {row["id"] for row in result["redundant"]} == {"inv"}
    assert {row["id"] for row in result["redundant_inherited"]} == {"ap", "fin"}


def test_childless_three_apps_and_same_app_is_not_overlap():
    bag, _ = _bag("childless-three-apps-many")
    result = run_tool(bag, "capability_health", {})
    tre = _by_id(result["records"])["tre"]
    assert tre["redundancy"] == "many" and tre["redundancy_hint"] == "3 apps on Treasury"

    bag, _ = _bag("two-single-app-activities-not-overlap")
    result = run_tool(bag, "capability_health", {})
    rows = _by_id(result["records"])
    assert rows["ap"]["redundancy"] == "none"
    assert rows["inv"]["redundancy"] == "none"
    assert result["redundant"] == []


def test_overlapping_tools_uses_activity_level_overlap_and_keeps_savings():
    bag, _ = _bag("finance")
    result = run_tool(bag, "overlapping_tools", {})
    assert result["overlap_count"] == 1
    [group] = result["overlaps"]
    assert group["capability"] == "Invoice capture"
    assert group["level"] == "activity"
    assert group["path"] == ["Finance", "Accounts Payable"]
    assert [tool["name"] for tool in group["tools"]] == ["Epic", "QuickBooks"]  # higher annual cost first (no users)
    assert group["up_to_savings_per_year"] == 42000
    assert result["up_to_savings_per_year"] == 42000
    inherited = {item["id"] for item in group["inherited_by"]}
    assert inherited == {"ap", "fin"}
    # Two single-app activities under one parent are not an overlap.
    bag, _ = _bag("two-single-app-activities-not-overlap")
    none = run_tool(bag, "overlapping_tools", {})
    assert none["overlap_count"] == 0
    assert none["up_to_savings_per_year"] in (0, None)


def test_overlapping_tools_fixture_savings_are_unchanged():
    from tests.test_ai_landscape import _bag as landscape_bag, _graph as landscape_graph

    bag = landscape_bag(landscape_graph(CIO["objects"], CIO["relationships"]))
    result = run_tool(bag, "overlapping_tools", {})
    assert result["overlap_count"] == len(CIO["expected"]["overlaps"]["groups"])
    assert result["up_to_savings_per_year"] == CIO["expected"]["overlaps"]["savingsCents"] // 100
    names = [group["capability"] for group in result["overlaps"]]
    assert names == [group["name"] for group in CIO["expected"]["overlaps"]["groups"]]
    # The CIO view itself still returns the same groups and savings.
    assert overlaps(CIO["objects"], CIO["relationships"]) == CIO["expected"]["overlaps"]


def test_health_step_and_tool_are_wired():
    bag, _ = _bag("finance")
    result = run_tool(bag, "capability_health", {})
    label = steps.tool_step(1, "capability_health", {}, result)["label"]
    assert "activity with no apps" in label
    names = [item["name"] for item in tool_specs(include_ai=False)]
    assert "capability_health" in names and "overlapping_tools" in names
    assert build_gemini_tools(tool_specs())
    assert "capability_health" in SYSTEM
    assert "Full coverage first" in SYSTEM or "full coverage first" in SYSTEM
    assert "best fitness" in SYSTEM
    assert "no redundancy" in SYSTEM
    assert "Say which of those criteria" in SYSTEM or "must say which of those criteria" in SYSTEM or "say which of those criteria" in SYSTEM
    assert "no enabling apps" in SYSTEM and "Do not count those from the workspace" in SYSTEM
    assert "Do not use find_gaps for capabilities or activities with no apps" in SYSTEM
    assert len({item.name for item in TOOLS}) == len(TOOLS)
    spec = next(item for item in tool_specs() if item["name"] == "capability_health")
    assert "level" in spec["input_schema"]["properties"]
    assert "domain" in spec["input_schema"]["properties"]



def test_coverage_questions_are_detected():
    for question in (
        "list capabilities that have 0 enabling apps",
        "capabilities with no apps",
        "activities with no apps",
        "what has 0 apps",
        "which activities have no enabling apps",
        "where do we have coverage gaps",
    ):
        assert is_coverage_question(question), question
    for question in ("apps with 0 licences", "what renews in the next 90 days", "what has no owner"):
        assert not is_coverage_question(question), question


def test_finance_no_apps_lists_forecasts_only_and_notes_zero():
    bag, _ = _bag("finance")
    result = run_tool(bag, "capability_health", {})
    assert result["no_app_counts"] == {"domain": 0, "capability": 0, "activity": 1}
    assert result["level_counts"]["capability"] == 3
    assert [row["id"] for row in result["no_apps"]] == ["fc"]
    assert result["no_apps"][0]["level"] == "activity"
    assert "0" in bag.numbers  # "0 capabilities have no apps" must be allowed
    assert "1" in bag.numbers and "3" in bag.numbers and "4" in bag.numbers


def _gap_map(empty=12, covered=15):
    """A map with many empty L2 capabilities, so the gap count is outside the free 0-10 band."""
    objects = [{"id": "d", "type": "business_domain", "name": "Operations"}]
    edges = []
    empty_ids = [f"empty{i}" for i in range(empty)]
    covered_ids = [f"capped{i}" for i in range(covered)]
    for cid in empty_ids:
        objects.append({"id": cid, "type": "capability", "name": f"Empty {cid}", "properties": {"domain_id": "d"}})
    for cid in covered_ids:
        app = f"app-{cid}"
        objects.append({"id": cid, "type": "capability", "name": f"Covered {cid}", "properties": {"domain_id": "d"}})
        objects.append({"id": app, "type": "application", "name": f"App {cid}", "properties": {}})
        edges.append({"type": "supported_by", "from_object_id": cid, "to_object_id": app})
    return _graph(objects, edges), empty_ids, covered_ids


def _prepare(graph, question, *, use_health=False):
    from app.ai.ask.tools import ToolBag

    bag = ToolBag(graph=graph, seen_ids=set(graph.records), numbers=set())
    graph_numbers(graph, bag.numbers)
    harvest(question, bag.numbers)
    result = None
    if use_health:
        result = run_tool(bag, "capability_health", {})
        harvest(result, bag.numbers)
    return bag, result


def test_listing_zero_apps_fails_the_check_without_capability_health():
    """The workspace does not include capability totals, so '12 of 27' is ungrounded without the lookup."""
    graph, empty_ids, covered_ids = _gap_map(12, 15)
    question = "list capabilities that have 0 enabling apps"
    bag, _ = _prepare(graph, question, use_health=False)
    answer = {
        "headline": "12 of 27 capabilities have 0 enabling apps",
        "answer_markdown": "12 of 27 capabilities have 0 enabling apps. These are capabilities, not activities.",
        "item_ids": empty_ids,
        "citations": [],
    }
    assert _validate(answer, bag, question) == "ungrounded_number"


def test_listing_zero_apps_is_grounded_from_capability_health():
    graph, empty_ids, covered_ids = _gap_map(12, 15)
    question = "list capabilities that have 0 enabling apps"
    bag, result = _prepare(graph, question, use_health=True)
    assert result["no_app_counts"]["capability"] == 12
    assert result["level_counts"]["capability"] == 27
    assert result["no_app_counts"]["activity"] == 0
    assert {row["id"] for row in result["no_apps"]} == set(empty_ids)
    assert coverage_brief(result)["no_app_counts"]["capability"] == 12
    answer = {
        "headline": "12 of 27 capabilities have 0 enabling apps",
        "answer_markdown": "12 of 27 capabilities have 0 enabling apps. These are capabilities (L2), not activities.",
        "item_ids": empty_ids,
        "citations": [],
    }
    assert _validate(answer, bag, question) is None
    find_gaps = next(item for item in tool_specs() if item["name"] == "find_gaps")
    assert "capability_health" in find_gaps["description"]


def test_coverage_question_auto_runs_capability_health(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from tests.test_ask_engine import CTX, FakeModels, _text_response
    from app.ai.ask import loop

    graph, empty_ids, _ = _gap_map(12, 15)
    question = "list capabilities that have 0 enabling apps"
    answer = {
        "headline": "12 of 27 capabilities have 0 enabling apps",
        "answer_markdown": "12 of 27 capabilities have 0 enabling apps. These are capabilities, not activities.",
        "item_ids": empty_ids,
        "citations": [],
    }
    models = FakeModels([_text_response(answer)])
    monkeypatch.setattr(loop, "is_configured", lambda: True)
    monkeypatch.setattr(loop, "model_name", lambda: "gemini-2.5-flash")
    monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))
    result = asyncio.run(loop.answer_with_model(None, CTX, question, graph=graph))
    assert result["source"] == "llm", result.get("fallback_reason")
    assert "capability_health" in result["tools_used"]
    assert result["headline"] == "12 of 27 capabilities have 0 enabling apps"
    # The first model call stays JSON-mode without tools; the lookup was run by the server.
    assert models.configs[0].response_mime_type == "application/json" and not models.configs[0].tools
    prompt = models.calls  # generate_content stores configs, not prompt; check tools_used is enough
    assert len(models.configs) == 1
