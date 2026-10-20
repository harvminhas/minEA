"""Idle licences and overlapping tools: the Python mirror of apps/web/lib/reports/cio-views.ts.

Pure functions over plain catalog dicts. Money is in whole cents. tests/test_cio_views.py runs the
shared fixture (packages/types/src/fixtures/cio-views.fixture.json) through this file, and the web
test runs the same fixture through the TypeScript, so both give the same numbers.
"""

from __future__ import annotations

import math

from app.services.cost_lines import object_annual_dollars

TOOL_TYPES = {"application", "cloud_service", "solution", "technical_capability"}


def _s(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def _active(obj: dict) -> bool:
    return obj.get("status") != "retired"


def _count(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        n = float(value)
    elif isinstance(value, str) and value.strip():
        try:
            n = float(value.replace(",", ""))
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(n) or n < 0:
        return None
    return int(math.floor(n))


def _owner(obj: dict, by_id: dict[str, dict]) -> str:
    team_id = obj.get("owner_team_id")
    person_id = obj.get("point_of_contact_id")
    team = (by_id.get(team_id) or {}).get("name") if team_id else ""
    person = (by_id.get(person_id) or {}).get("name") if person_id else ""
    # Ask's graph carries team and contact names on the object instead of team records.
    team = team or _s(obj.get("owner_team_name"))
    person = person or _s(obj.get("point_of_contact_name"))
    return team or person or _s(obj.get("owner")) or ("Owner set" if team_id or person_id else "")


def annual_cents(properties: dict | None) -> int | None:
    dollars = object_annual_dollars(properties or {})
    return _half_up(dollars * 100) if dollars and dollars > 0 else None


def per_licence_cents(properties: dict | None, bought: int) -> int | None:
    """Per-user price × 12 from the first per-user cost line, else annual cost ÷ licences."""
    lines = (properties or {}).get("cost_lines")
    for line in lines if isinstance(lines, list) else []:
        calc = line.get("calculation") if isinstance(line, dict) else None
        if isinstance(calc, dict) and calc.get("kind") == "per_user":
            return max(0, int(calc.get("unit_price_monthly_cents") or 0)) * 12
    annual = annual_cents(properties)
    return _half_up(annual / bought) if annual is not None and bought > 0 else None


def in_use_count(properties: dict | None) -> int | None:
    return _count((properties or {}).get("licences_in_use"))


def idle_licences(objects: list[dict]) -> dict:
    by_id = {obj["id"]: obj for obj in objects}
    rows: list[dict] = []
    missing: list[dict] = []
    for obj in objects:
        if obj.get("type") != "application" or not _active(obj):
            continue
        props = obj.get("properties") or {}
        bought = _count(props.get("licence_count"))
        if not bought:
            continue
        in_use = in_use_count(props)
        if in_use is None:
            missing.append({"id": obj["id"], "name": obj["name"], "bought": bought})
            continue
        idle = max(0, bought - in_use)
        per = per_licence_cents(props, bought)
        rows.append(
            {
                "id": obj["id"],
                "name": obj["name"],
                "bought": bought,
                "inUse": in_use,
                "idle": idle,
                "perLicenceCents": per,
                "wastedCents": None if per is None else idle * per,
                "owner": _owner(obj, by_id),
                "renewal": _s(props.get("contract_renewal")) or None,
            }
        )
    rows.sort(key=lambda r: (-(r["wastedCents"] if r["wastedCents"] is not None else -1), -r["idle"], r["name"]))
    missing.sort(key=lambda m: (-m["bought"], m["name"]))
    return {
        "rows": rows,
        "missing": missing,
        "totals": {
            "wastedCents": sum(r["wastedCents"] or 0 for r in rows),
            "idle": sum(r["idle"] for r in rows),
            "bought": sum(r["bought"] for r in rows),
        },
    }


def overlaps(objects: list[dict], relationships: list[dict]) -> dict:
    by_id = {obj["id"]: obj for obj in objects}
    linked: set[str] = set()
    targets: dict[str, list[str]] = {}
    for edge in relationships:
        if edge.get("type") != "supported_by":
            continue
        src = by_id.get(edge.get("from_object_id"))
        dst = by_id.get(edge.get("to_object_id"))
        if not src or not dst or src.get("type") != "capability" or dst.get("type") not in TOOL_TYPES:
            continue
        linked.add(dst["id"])
        if not _active(src) or not _active(dst):
            continue
        ids = targets.setdefault(src["id"], [])
        if dst["id"] not in ids:
            ids.append(dst["id"])
    groups = []
    for cap_id, ids in targets.items():
        if len(ids) < 2:
            continue
        tools = []
        for tool_id in ids:
            obj = by_id[tool_id]
            props = obj.get("properties") or {}
            users = in_use_count(props)
            tools.append(
                {
                    "id": tool_id,
                    "name": obj["name"],
                    "type": obj["type"],
                    "annualCents": annual_cents(props),
                    "owner": _owner(obj, by_id),
                    "users": users if users is not None else _count(props.get("licence_count")),
                    "renewal": _s(props.get("contract_renewal")) or None,
                }
            )
        tools.sort(
            key=lambda t: (
                -(t["users"] if t["users"] is not None else -1),
                -(t["annualCents"] if t["annualCents"] is not None else -1),
                t["name"],
            )
        )
        groups.append(
            {"id": cap_id, "name": by_id[cap_id]["name"], "tools": tools, "savingsCents": sum(t["annualCents"] or 0 for t in tools[1:])}
        )
    groups.sort(key=lambda g: (-g["savingsCents"], -len(g["tools"]), g["name"]))
    kept = {g["tools"][0]["id"] for g in groups}
    dropped: dict[str, int] = {}
    for group in groups:
        for tool in group["tools"][1:]:
            if tool["id"] not in kept:
                dropped[tool["id"]] = tool["annualCents"] or 0
    by_category: dict[str, list[dict]] = {}
    for obj in objects:
        if obj.get("type") != "application" or not _active(obj) or obj["id"] in linked:
            continue
        category = _s((obj.get("properties") or {}).get("category"))
        if not category or category == "Other":
            continue
        by_category.setdefault(category, []).append({"id": obj["id"], "name": obj["name"]})
    hints = [
        {"category": category, "tools": sorted(items, key=lambda t: t["name"])}
        for category, items in by_category.items()
        if len(items) >= 2
    ]
    hints.sort(key=lambda h: (-len(h["tools"]), h["category"]))
    return {"groups": groups, "savingsCents": sum(dropped.values()), "categoryHints": hints}
