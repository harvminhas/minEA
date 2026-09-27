"""
Ask lookups.

Add a lookup by appending an AskTool to TOOLS. The loop picks them up
from this list. It does not need a change when a lookup is added.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Callable

from app.ai.ask.graph import Rec, WorkspaceGraph, fold
from app.ai.ask.impact import ImpactEdge, impact_of as traverse_impact

ToolFn = Callable[["ToolBag", dict], dict]


@dataclass
class AskTool:
    name: str
    description: str
    parameters: dict
    run: ToolFn


@dataclass
class ToolBag:
    graph: WorkspaceGraph
    seen_ids: set[str]
    numbers: set[str]

    def note_record(self, rec: Rec) -> None:
        self.seen_ids.add(rec.id)
        if rec.annual is not None:
            self.numbers.add(str(int(rec.annual)))
            self.numbers.add(f"{int(rec.annual):,}")
        if rec.renewal:
            for token in re.findall(r"\d+", rec.renewal):
                self.numbers.add(token)

    def note_number(self, value: int | float) -> None:
        whole = int(value) if float(value).is_integer() else value
        self.numbers.add(str(whole))
        if isinstance(whole, int):
            self.numbers.add(f"{whole:,}")


def _estate(graph: WorkspaceGraph) -> list[Rec]:
    return [rec for rec in graph.records.values() if rec.type in {"application", "infrastructure"}]


def search_records(bag: ToolBag, args: dict) -> dict:
    text = fold(str(args.get("text") or ""))
    limit = min(int(args.get("limit") or 8), 20)
    matches = []
    for rec in bag.graph.records.values():
        if rec.type == "other":
            continue
        hay = fold(rec.name)
        if text and text in hay:
            bag.note_record(rec)
            matches.append({**rec.summary(), "score": len(text) / max(len(hay), 1)})
    matches.sort(key=lambda item: (-item["score"], item["name"]))
    bag.note_number(len(matches[:limit]))
    return {"matches": matches[:limit], "total": len(matches)}


def impact_of(bag: ToolBag, args: dict) -> dict:
    target = bag.graph.get(str(args.get("id") or ""))
    if not target:
        return {"error": "not_found", "message": "That record is not in this workspace."}
    bag.note_record(target)
    names = {rec.id: rec.name for rec in bag.graph.records.values()}
    edges = [ImpactEdge(edge.relation, edge.from_id, edge.to_id) for edge in bag.graph.edges]
    affected = traverse_impact(names, edges, target.id)
    for hit in affected:
        rec = bag.graph.get(hit["id"])
        if rec:
            bag.note_record(rec)
    direct = [hit for hit in affected if hit["severity"] == "direct" and not hit["indirect"]]
    indirect = [hit for hit in affected if hit["severity"] == "direct" and hit["indirect"]]
    critical = []
    for hit in direct:
        rec = bag.graph.get(hit["id"])
        if rec and rec.criticality == "Critical":
            critical.append(hit)
    counts = {
        "direct": len(direct),
        "indirect": len(indirect),
        "degraded": sum(1 for hit in affected if hit["severity"] == "degraded"),
        "loses_support": sum(1 for hit in affected if hit["severity"] == "loses_support"),
        "critical_direct": len(critical),
    }
    for value in counts.values():
        bag.note_number(value)
    gaps = []
    for hit in [ {"id": target.id}, *affected ]:
        rec = bag.graph.get(hit["id"])
        if not rec:
            continue
        for field in rec.blank:
            gaps.append({"record_id": rec.id, "field": field, "message": f"{rec.name} has no {field.replace('_', ' ')}."})
    return {
        "target": target.summary(),
        "affected": [
            {
                **(bag.graph.get(hit["id"]).summary() if bag.graph.get(hit["id"]) else {"id": hit["id"], "name": hit["name"]}),
                "severity": hit["severity"],
                "indirect": hit["indirect"],
                "depth": hit["depth"],
                "path": [step["label"] for step in hit["path"]],
            }
            for hit in affected
        ],
        "counts": counts,
        "gaps": gaps[:10],
    }


def aggregate(bag: ToolBag, args: dict) -> dict:
    wanted = str(args.get("type") or "estate")
    metric = str(args.get("metric") or "count")
    filters = args.get("filters") or {}
    rows = _estate(bag.graph)
    if wanted == "application":
        rows = [rec for rec in rows if rec.type == "application"]
    elif wanted == "infrastructure":
        rows = [rec for rec in rows if rec.type == "infrastructure"]
    if filters.get("missing_field") == "owner":
        rows = [rec for rec in rows if "owner" in rec.blank]
    criticality = str(filters.get("criticality") or "").strip().lower()
    if criticality in {"tier1", "critical"}:
        criticality = "critical"
    if criticality:
        rows = [rec for rec in rows if (rec.criticality or "").lower() == criticality]
    within = filters.get("renewal_within_days")
    if isinstance(within, int):
        end = date.today() + timedelta(days=within)
        bag.note_number(within)
        kept = []
        for rec in rows:
            if not rec.renewal or len(rec.renewal) < 10:
                continue
            try:
                renews = date.fromisoformat(rec.renewal[:10])
            except ValueError:
                continue
            if date.today() <= renews <= end:
                kept.append(rec)
        rows = kept
    rank = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
    rows.sort(key=lambda rec: (-rank.get(rec.criticality or "", 0), rec.name))
    for rec in rows:
        bag.note_record(rec)
    total = sum(rec.annual or 0 for rec in rows)
    bag.note_number(len(rows))
    if metric == "sum_annual_cost":
        bag.note_number(int(total))
    groups: list[dict] = []
    if args.get("group_by") == "vendor":
        buckets: dict[str, list[Rec]] = {}
        for rec in rows:
            if rec.vendor and rec.annual:
                buckets.setdefault(rec.vendor, []).append(rec)
        ranked = sorted(buckets.items(), key=lambda item: -sum(rec.annual or 0 for rec in item[1]))
        spend = sum(rec.annual or 0 for rec in rows if rec.annual)
        running = 0.0
        for name, items in ranked[: int(args.get("top") or 10)]:
            amount = sum(rec.annual or 0 for rec in items)
            running += amount
            share = round(amount / spend * 100) if spend else 0
            bag.note_number(int(amount))
            bag.note_number(share)
            groups.append(
                {
                    "key": name,
                    "count": len(items),
                    "annual_cost": int(amount),
                    "share_pct": share,
                    "record_ids": [rec.id for rec in items],
                }
            )
        if groups:
            bag.note_number(round(running / spend * 100) if spend else 0)
    return {
        "metric": metric,
        "count": len(rows),
        "annual_cost": int(total) if metric == "sum_annual_cost" else None,
        "groups": groups,
        "records": [rec.summary() for rec in rows[:50]],
    }


def find_gaps(bag: ToolBag, args: dict) -> dict:
    rows = _estate(bag.graph)
    scope = str(args.get("scope") or "estate")
    if scope == "applications":
        rows = [rec for rec in rows if rec.type == "application"]
    elif scope == "infrastructure":
        rows = [rec for rec in rows if rec.type == "infrastructure"]
    gaps = []
    for rec in rows:
        if not rec.blank:
            continue
        bag.note_record(rec)
        gaps.append(
            {
                "record_id": rec.id,
                "record_name": rec.name,
                "type": rec.type,
                "field": rec.blank[0],
                "message": f"{rec.name} is missing {', '.join(field.replace('_', ' ') for field in rec.blank)}.",
            }
        )
    bag.note_number(len(gaps))
    return {"gaps": gaps[:50], "count": len(gaps)}


TOOLS: list[AskTool] = [
    AskTool(
        name="search_records",
        description="Find records in this workspace by name. Use this first to turn a name in the question into an id.",
        parameters={
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["text"],
        },
        run=search_records,
    ),
    AskTool(
        name="impact_of",
        description="What is affected if this record fails. Each affected record has severity direct, degraded, or loses_support, indirect true when it is more than one step away, and a path of labels. Use the counts. Do not add records the tool did not return.",
        parameters={
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
        },
        run=impact_of,
    ),
    AskTool(
        name="aggregate",
        description="Count records or sum annual cost. Use for any total, share, renewal window, or criticality question such as the most critical system. filters.criticality is Critical, High, Medium, or Low. Do not add numbers yourself.",
        parameters={
            "type": "object",
            "properties": {
                "type": {"type": "string"},
                "metric": {"type": "string"},
                "group_by": {"type": "string"},
                "top": {"type": "integer"},
                "filters": {
                    "type": "object",
                    "properties": {
                        "criticality": {"type": "string"},
                        "missing_field": {"type": "string"},
                        "renewal_within_days": {"type": "integer"},
                    },
                },
            },
            "required": ["type", "metric"],
        },
        run=aggregate,
    ),
    AskTool(
        name="find_gaps",
        description="List records with missing owner, vendor, cost, renewal, lifecycle, or criticality.",
        parameters={
            "type": "object",
            "properties": {"scope": {"type": "string"}},
        },
        run=find_gaps,
    ),
]


def tool_specs() -> list[dict]:
    return [{"name": tool.name, "description": tool.description, "input_schema": tool.parameters} for tool in TOOLS]


def run_tool(bag: ToolBag, name: str, args: dict) -> dict:
    tool = next((item for item in TOOLS if item.name == name), None)
    if not tool:
        return {"error": "unknown_tool", "message": f"{name} is not a lookup Ask can run."}
    try:
        return tool.run(bag, args or {})
    except Exception as exc:  # a bad lookup must not take down the turn
        return {"error": "tool_failed", "message": str(exc)}
