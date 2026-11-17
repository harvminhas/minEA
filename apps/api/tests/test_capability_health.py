"""Capability health lookup: Python tree matches the web fixture, and Ask uses the same numbers."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from app.ai.ask import steps
from app.ai.ask.capability_tree import build_capability_tree, is_activity, parse_link_fitness
from app.ai.ask.cio_views import overlaps
from app.ai.ask.graph import Edge, WorkspaceGraph, _record
from app.ai.ask.loop import SYSTEM
from app.ai.ask.tools import TOOLS, run_tool, tool_specs
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
    assert "scored" in label and "coverage gap" in label and "overlap" in label
    names = [item["name"] for item in tool_specs(include_ai=False)]
    assert "capability_health" in names and "overlapping_tools" in names
    assert build_gemini_tools(tool_specs())
    assert "capability_health" in SYSTEM
    assert "Full coverage first" in SYSTEM or "full coverage first" in SYSTEM
    assert "best fitness" in SYSTEM
    assert "no redundancy" in SYSTEM
    assert "Say which of those criteria" in SYSTEM or "must say which of those criteria" in SYSTEM
    assert len({item.name for item in TOOLS}) == len(TOOLS)
    spec = next(item for item in tool_specs() if item["name"] == "capability_health")
    assert "level" in spec["input_schema"]["properties"]
    assert "domain" in spec["input_schema"]["properties"]
