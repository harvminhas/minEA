"""Idle licences and overlapping tools: the Python mirror matches the web numbers, and the Ask lookups."""

import json
from pathlib import Path

from app.ai.ask import steps
from app.ai.ask.cio_views import idle_licences, overlaps, per_licence_cents
from app.ai.ask.loop import SYSTEM
from app.ai.ask.tools import TOOLS, run_tool, tool_specs
from app.ai.gemini_client import build_gemini_tools
from tests.test_ai_landscape import _bag, _graph

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "packages/types/src/fixtures/cio-views.fixture.json").read_text(encoding="utf-8"))


def _fixture_bag():
    return _bag(_graph(FIXTURE["objects"], FIXTURE["relationships"]))


def test_the_fixture_gives_the_same_output_as_typescript():
    assert idle_licences(FIXTURE["objects"]) == FIXTURE["expected"]["idle"]
    assert overlaps(FIXTURE["objects"], FIXTURE["relationships"]) == FIXTURE["expected"]["overlaps"]


def test_idle_rules():
    result = idle_licences(FIXTURE["objects"])
    by_name = {row["name"]: row for row in result["rows"]}
    # Per-user price wins: $165/mo × 12 × 40 idle.
    assert by_name["Salesforce Sales Cloud"]["wastedCents"] == 40 * 16500 * 12
    # No per-user line: annual ÷ licences ($44,560 / 220 = $202.55), × 52 idle.
    assert by_name["Zoom"]["perLicenceCents"] == 20255
    assert by_name["Zoom"]["wastedCents"] == 52 * 20255
    assert by_name["Miro"]["wastedCents"] is None  # no cost recorded
    assert "Old CRM" not in by_name  # retired
    assert [m["name"] for m in result["missing"]][:1] == ["Microsoft 365 E3"]
    assert per_licence_cents({}, 10) is None


def test_overlap_rules():
    result = overlaps(FIXTURE["objects"], FIXTURE["relationships"])
    names = [g["name"] for g in result["groups"]]
    assert "Payroll" not in names and "Retired thing" not in names
    crm = next(g for g in result["groups"] if g["name"] == "CRM")
    assert [t["name"] for t in crm["tools"]] == ["Salesforce Sales Cloud", "HubSpot Sales"]  # retired and duplicate links dropped
    assert {h["category"] for h in result["categoryHints"]} == {"Analytics", "Collaboration"}


def test_ask_lookups_return_the_same_numbers_as_the_web():
    bag = _fixture_bag()
    idle = run_tool(bag, "idle_licences", {})
    expected = FIXTURE["expected"]["idle"]["totals"]
    assert idle["totals"]["wasted_per_year"] == round(expected["wastedCents"] / 100)
    assert idle["totals"]["idle_licences"] == expected["idle"]
    assert "89,733" in bag.numbers and "sf" in bag.seen_ids
    over = run_tool(bag, "overlapping_tools", {})
    assert over["overlap_count"] == len(FIXTURE["expected"]["overlaps"]["groups"])
    assert over["up_to_savings_per_year"] == FIXTURE["expected"]["overlaps"]["savingsCents"] // 100
    label = steps.tool_step(1, "idle_licences", {}, idle)["label"]
    assert label.startswith("107 idle licences across 4 apps")
    assert "up to $69,160 a year" in steps.tool_step(2, "overlapping_tools", {}, over)["label"]


def test_lookups_are_in_the_ai_first_tool_set():
    names = [t["name"] for t in tool_specs(include_ai=False)]
    assert "idle_licences" in names and "overlapping_tools" in names
    assert build_gemini_tools(tool_specs())
    assert "idle_licences" in SYSTEM and "overlapping_tools" in SYSTEM
    assert len({t.name for t in TOOLS}) == len(TOOLS)
