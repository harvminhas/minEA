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

from app.ai.ask.ai_landscape import JOB_LABELS, ai_landscape as build_landscape, data_access
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
        self.note_name(rec.name)
        if rec.annual is not None:
            self.numbers.add(str(int(rec.annual)))
            self.numbers.add(f"{int(rec.annual):,}")
        if rec.renewal:
            for token in re.findall(r"\d+", rec.renewal):
                self.numbers.add(token)

    def note_name(self, name: str) -> None:
        """Digits inside a returned name ("Microsoft 365", "GPT-4o") are not made-up numbers."""
        for token in re.findall(r"\d+", name or ""):
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
        return {"error": "not_found", "message": "That item is not in this workspace."}
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
        "loses_sign_in": sum(1 for hit in affected if hit["severity"] == "loses_sign_in"),
        "critical_direct": len(critical),
    }
    by_type: dict[str, int] = {}
    for hit in affected:
        rec = bag.graph.get(hit["id"])
        label = rec.type_label() if rec else "Item"
        by_type[label] = by_type.get(label, 0) + 1
    for value in [*counts.values(), *by_type.values()]:
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
        "by_type": by_type,
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
    missing_field = _GAP_FIELDS.get(str(filters.get("missing_field") or "").strip().lower())
    if missing_field:
        rows = [rec for rec in rows if missing_field in rec.blank]
    criticality = str(filters.get("criticality") or "").strip().lower()
    if criticality in {"tier1", "critical"}:
        criticality = "critical"
    if criticality:
        rows = [rec for rec in rows if (rec.criticality or "").lower() == criticality]
    within = filters.get("renewal_within_days")
    with_renewal_date: int | None = None
    window: dict | None = None
    if isinstance(within, int):
        start = date.today()
        end = start + timedelta(days=within)
        bag.note_number(within)
        # Give the model the window's dates so it never works them out itself. Without this it wrote
        # e.g. "between October 10, 2026 and January 8, 2027", and those numbers failed the grounding
        # check (a false "needed a correction", most visible on an empty estate where nothing else is said).
        window = {"from": start.isoformat(), "to": end.isoformat()}
        for day in (start, end):
            for part in (day.year, day.month, day.day):
                bag.note_number(part)
        kept = []
        with_renewal_date = 0
        for rec in rows:
            if not rec.renewal or len(rec.renewal) < 10:
                continue
            try:
                renews = date.fromisoformat(rec.renewal[:10])
            except ValueError:
                continue
            with_renewal_date += 1
            if date.today() <= renews <= end:
                kept.append(rec)
        rows = kept
        bag.note_number(with_renewal_date)
    rank = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
    rows.sort(key=lambda rec: (-rank.get(rec.criticality or "", 0), rec.name))
    for rec in rows:
        bag.note_record(rec)
    total = sum(rec.annual or 0 for rec in rows)
    bag.note_number(len(rows))
    by_type: dict[str, int] = {}
    for rec in rows:
        by_type[rec.type_label()] = by_type.get(rec.type_label(), 0) + 1
    for value in by_type.values():
        bag.note_number(value)
    if metric == "sum_annual_cost":
        bag.note_number(int(total))
    groups: list[dict] = []
    if args.get("group_by") == "vendor":
        buckets: dict[str, list[Rec]] = {}
        for rec in rows:
            for name in rec.vendor_names:
                buckets.setdefault(name, []).append(rec)
        ranked = sorted(
            buckets.items(),
            key=lambda item: (
                -sum(rec.annual or 0 for rec in item[1] if (rec.vendor or "").lower() == item[0].lower()),
                item[0].lower(),
            ),
        )
        spend = sum(rec.annual or 0 for rec in rows if rec.annual)
        running = 0.0
        for name, items in ranked[: int(args.get("top") or 10)]:
            amount = sum(rec.annual or 0 for rec in items if (rec.vendor or "").lower() == name.lower())
            running += amount
            share = round(amount / spend * 100) if spend else 0
            bag.note_number(int(amount))
            bag.note_number(share)
            groups.append(
                {
                    "key": name,
                    "count": len(items),
                    "annual_cost": int(amount) if amount else None,
                    "share_pct": share if amount else None,
                    "record_ids": [rec.id for rec in items],
                }
            )
        bag.note_number(len(groups))
        if groups and spend:
            bag.note_number(round(running / spend * 100) if spend else 0)
    return {
        "metric": metric,
        "count": len(rows),
        "by_type": by_type,
        "annual_cost": int(total) if metric == "sum_annual_cost" else None,
        "groups": groups,
        "records": [rec.summary() for rec in rows[:50]],
        **({"with_renewal_date": with_renewal_date} if with_renewal_date is not None else {}),
        **({"window": window} if window else {}),
    }


_GAP_FIELDS = {
    "vendor": "vendor",
    "owner": "owner",
    "cost": "annual_cost",
    "annual_cost": "annual_cost",
    "renewal": "renewal_date",
    "renewal_date": "renewal_date",
    "lifecycle": "lifecycle",
    "criticality": "criticality",
}


def find_gaps(bag: ToolBag, args: dict) -> dict:
    rows = _estate(bag.graph)
    scope = str(args.get("scope") or "estate")
    if scope == "applications":
        rows = [rec for rec in rows if rec.type == "application"]
    elif scope == "infrastructure":
        rows = [rec for rec in rows if rec.type == "infrastructure"]
    field = _GAP_FIELDS.get(str(args.get("field") or "").strip().lower())
    gaps = []
    for rec in rows:
        blank = [item for item in rec.blank if item == field] if field else list(rec.blank)
        if not blank:
            continue
        bag.note_record(rec)
        gaps.append(
            {
                "record_id": rec.id,
                "record_name": rec.name,
                "type": rec.type,
                "type_label": rec.type_label(),
                "field": blank[0],
                "message": f"{rec.name} is missing {', '.join(item.replace('_', ' ') for item in blank)}.",
            }
        )
    by_type: dict[str, int] = {}
    for gap in gaps:
        by_type[gap["type_label"]] = by_type.get(gap["type_label"], 0) + 1
    bag.note_number(len(gaps))
    for value in by_type.values():
        bag.note_number(value)
    return {"gaps": gaps[:50], "count": len(gaps), "by_type": by_type}


SIGN_IN_EDGE = "authenticates_via"
OWN_LOGIN = "own_login"
_SIGN_IN_TYPES = {"application", "solution", "technical_capability", "cloud_service"}
_RETIRED = {"retired", "end_of_life"}


def _sign_in_candidate(obj: dict) -> bool:
    """Apps and platforms still in use. Same rule as isSignInCandidate in apps/web/lib/sign-in.ts."""
    props = obj.get("properties") or {}
    lifecycle = props.get("lifecycle") if isinstance(props.get("lifecycle"), str) else ""
    return obj.get("type") in _SIGN_IN_TYPES and obj.get("status") not in _RETIRED and lifecycle not in _RETIRED


def sign_in(bag: ToolBag, args: dict) -> dict:
    """Sign-in (single sign-on) links: who signs in with what, and what has nothing recorded."""
    objects = {str(obj.get("id")): obj for obj in bag.graph.objects}
    links = [edge for edge in bag.graph.edges if edge.relation == SIGN_IN_EDGE]
    signs_in_with: dict[str, list[str]] = {}
    sign_in_for: dict[str, list[str]] = {}
    for edge in links:
        signs_in_with.setdefault(edge.from_id, []).append(edge.to_id)
        sign_in_for.setdefault(edge.to_id, []).append(edge.from_id)

    def summary(record_id: str) -> dict:
        rec = bag.graph.get(record_id)
        if rec:
            bag.note_record(rec)
            return rec.summary()
        obj = objects.get(record_id) or {}
        bag.note_name(str(obj.get("name") or ""))
        return {"id": record_id, "name": obj.get("name") or record_id}

    def own_login(record_id: str) -> bool:
        props = (objects.get(record_id) or {}).get("properties") or {}
        return props.get("sign_in") == OWN_LOGIN and record_id not in signs_in_with

    record_id = str(args.get("id") or "")
    if record_id:
        if record_id not in objects and not bag.graph.get(record_id):
            return {"error": "not_found", "message": "That item is not in this workspace."}
        users = sorted(sign_in_for.get(record_id, []))
        providers = sorted(signs_in_with.get(record_id, []))
        bag.note_number(len(users))
        return {
            "target": summary(record_id),
            "signs_in_with": [summary(item) for item in providers],
            "own_login": own_login(record_id),
            "sign_in_for": [summary(item) for item in users],
            "sign_in_for_count": len(users),
        }

    candidates = [obj_id for obj_id, obj in objects.items() if _sign_in_candidate(obj)]
    # Part of a provider (Exchange Online in Microsoft 365) signs in with it by definition.
    part_of_provider = {edge.from_id for edge in bag.graph.edges if edge.relation == "part_of" and edge.to_id in sign_in_for}
    own = sorted((obj_id for obj_id in candidates if own_login(obj_id)), key=lambda item: str(objects[item].get("name") or ""))
    not_recorded = sorted(
        (
            obj_id
            for obj_id in candidates
            if obj_id not in signs_in_with
            and obj_id not in sign_in_for
            and obj_id not in part_of_provider
            and not own_login(obj_id)
        ),
        key=lambda item: str(objects[item].get("name") or ""),
    )
    providers = sorted(sign_in_for, key=lambda item: (-len(sign_in_for[item]), str((objects.get(item) or {}).get("name") or "")))
    for value in [len(links), len(own), len(not_recorded), len(providers), *(len(sign_in_for[item]) for item in providers)]:
        bag.note_number(value)
    return {
        "providers": [
            {"provider": summary(item), "count": len(sign_in_for[item]), "sign_in_for": [summary(user) for user in sorted(sign_in_for[item])]}
            for item in providers
        ],
        "own_login": [summary(item) for item in own],
        "own_login_count": len(own),
        "not_recorded": [summary(item) for item in not_recorded[:50]],
        "not_recorded_count": len(not_recorded),
        "links_recorded": len(links),
    }


AI_GROUPS = {"features", "agents", "platforms"}
AI_FLAGS = {"F1", "F2", "F3", "F4", "F5", "F6"}


def _seats(feature_item: dict, host: dict) -> int | None:
    line_id = feature_item["feature"].get("cost_line_id")
    lines = (host.get("properties") or {}).get("cost_lines")
    for line in lines if isinstance(lines, list) else []:
        if isinstance(line, dict) and line.get("id") == line_id:
            calc = line.get("calculation") or {}
            if calc.get("kind") == "per_user":
                return int(calc.get("seats") or 0) or None
    return None


def ai_landscape(bag: ToolBag, args: dict) -> dict:
    """§8: the AI landscape report as data. Item ids are record ids (a feature's id is its app)."""
    objects = bag.graph.objects
    relationships = [{"type": edge.relation, "from_object_id": edge.from_id, "to_object_id": edge.to_id} for edge in bag.graph.edges]
    result = build_landscape(objects, relationships)
    by_id = {obj["id"]: obj for obj in objects}
    group = str(args.get("group") or "").strip().lower()
    flag_filter = str(args.get("flag") or "").strip().upper()

    def label(record_id: str) -> str:
        rec = bag.graph.get(record_id)
        return rec.type_label() if rec else "Item"

    def note(record_id: str) -> None:
        rec = bag.graph.get(record_id)
        if rec:
            bag.note_record(rec)

    feature_rows = []
    for item in result["features"]:
        feature = item["feature"]
        seats = _seats(item, by_id.get(item["hostId"]) or {})
        feature_rows.append(
            {
                "id": item["hostId"],
                "name": feature["name"],
                "app": item["hostName"],
                "type_label": label(item["hostId"]),
                "status": feature.get("status"),
                "audience": feature.get("audience"),
                "sees_company_data": feature.get("sees_company_data"),
                "vendor_trains": feature.get("vendor_trains"),
                "job": JOB_LABELS.get(item["job"], item["job"]),
                "seats": seats,
                "add_on_per_year": item["addOn"],
            }
        )
    agent_rows = []
    for agent in result["agents"]:
        if not agent["active"]:
            continue
        agent_rows.append(
            {
                "id": agent["id"],
                "name": agent["name"],
                "type_label": label(agent["id"]),
                "status": agent["status"],
                "job": JOB_LABELS.get(agent["job"], agent["job"]),
                "built_with": [item["name"] for item in agent["builtWith"]],
                "models": [item["name"] for item in agent["models"]],
                "reads": [item["name"] for item in agent["reads"]],
                "writes": [item["name"] for item in agent["writes"]],
                "acts_as": agent["actsAs"],
                "autonomy": agent["autonomy"] or None,
                "owner": agent["owner"] or None,
                "cost_per_year": agent["cost"],
            }
        )
    platform_rows = [
        {
            "id": item["id"],
            "name": item["name"],
            "type_label": label(item["id"]),
            "kind": item["kindLabel"],
            "counted_in_spend": item["counted"],
            "vendor": item["vendor"] or None,
            "used_by": [use["name"] for use in item["usedBy"]],
            "vendor_trains": item["vendorTrains"] or None,
            "cost_per_year": item["cost"],
        }
        for item in result["platforms"]
    ]

    def records_for(item_ids: list[str]) -> list[str]:
        found: list[str] = []
        for item_id in item_ids:
            record_id = item_id.split(":", 1)[0] if ":" in item_id else item_id
            if record_id not in found:
                found.append(record_id)
        return found

    names = {obj["id"]: obj["name"] for obj in objects}
    feature_names = {item["id"]: f"{item['feature']['name']} ({item['hostName']})" for item in result["features"]}
    flag_rows = [
        {
            "flag": flag["id"],
            "severity": flag["severity"],
            "title": flag["title"],
            "why": flag["why"],
            "items": [feature_names.get(item_id) or names.get(item_id, item_id) for item_id in flag["itemIds"]],
            "record_ids": records_for(flag["itemIds"]),
        }
        for flag in result["flags"]
        if not flag_filter or flag["id"] == flag_filter
    ]
    access = data_access(objects, relationships, result)
    f1_why = {item_id: flag["why"] for flag in result["flags"] if flag["id"] == "F1" for item_id in flag["itemIds"]}

    def access_row(item_id: str, why: bool = False) -> dict:
        row = {"name": feature_names.get(item_id) or names.get(item_id, item_id), "record_id": records_for([item_id])[0]}
        if why:
            row["why"] = f1_why.get(item_id, "")
        return row

    customer_data = {
        "rule": (
            "For any question about customer, financial or personal data, answer only from this block. It is flag F1: "
            "what each app's Holds data field says (or its category default). Can see company data, or an agent "
            "reading an app, does not mean customer data."
        ),
        "can_see": [access_row(item_id, why=True) for item_id in access["customer"]],
        "might_see": [access_row(item_id, why=True) for item_id in access["check"]],
        "can_see_company_data_only": [access_row(item_id) for item_id in access["company_only"]],
        "apps_with_no_holds_data": [{"name": names.get(record_id, record_id), "record_id": record_id, "type_label": label(record_id)} for record_id in access["no_holds_data"]],
        "if_none": (
            "If can_see and might_see are both empty, say plainly that nothing recorded holds customer or financial data. "
            "Then, as a separate point, name the AI that can see company data and the apps with no Holds data recorded."
        ),
    }

    by_flag: dict[str, int] = {}
    for flag in result["flags"]:
        by_flag[flag["id"]] = by_flag.get(flag["id"], 0) + 1

    counts = {
        "places": result["places"],
        "features": len(feature_rows),
        "agents": len(agent_rows),
        "platforms_and_models": sum(1 for item in result["platforms"] if item["counted"]),
        "flags": len(result["flags"]),
        "high_flags": result["highFlags"],
        "unreviewed": len(result["unreviewed"]),
    }
    spend = {
        "total_per_year": result["spend"]["total"],
        "per_seat_add_ons": result["spend"]["addOns"],
        "platforms_and_models": result["spend"]["platforms"],
        "agents": result["spend"]["agents"],
    }
    shown = {
        "features": feature_rows if group in {"", "features"} else [],
        "agents": agent_rows if group in {"", "agents"} else [],
        "platforms": platform_rows if group in {"", "platforms"} else [],
    }
    for rows in shown.values():
        for row in rows:
            note(row["id"])
            for key in ("seats", "add_on_per_year", "cost_per_year"):
                if isinstance(row.get(key), (int, float)):
                    bag.note_number(row[key])
    for flag in flag_rows:
        for record_id in flag["record_ids"]:
            note(record_id)
    for value in [*counts.values(), *spend.values(), *by_flag.values()]:
        bag.note_number(value)
    for row in feature_rows:
        bag.note_name(row["name"])
    for flag in flag_rows:
        for name in flag["items"]:
            bag.note_name(name)
    for rows in customer_data.values():
        for row in rows if isinstance(rows, list) else []:
            note(row["record_id"])
            bag.note_name(row["name"])
    for flag_id in by_flag:
        bag.numbers.add(flag_id[1:])  # "F1" in an answer must not read as an ungrounded 1
    return {
        "counts": counts,
        "spend": spend,
        "flags_by_kind": by_flag,
        "flags": flag_rows,
        "customer_data": customer_data,
        **shown,
        "unreviewed_count": len(result["unreviewed"]),
        "unreviewed_apps": sorted({row["hostName"] for row in result["unreviewed"]}),
        "group": group if group in AI_GROUPS else None,
        "flag": flag_filter if flag_filter in AI_FLAGS else None,
        "report": "Reports › AI landscape",
    }


TOOLS: list[AskTool] = [
    AskTool(
        name="search_records",
        description="Find an application, capability, infrastructure item, or other item by name. Each match includes type_label. Use this first to turn a name in the question into an id.",
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
        description="What is affected if this item fails. Each result includes type_label, severity direct, loses_sign_in (people can't sign in to it; it is still running), degraded, or loses_support, indirect true when it is more than one step away, and a path of labels. by_type counts each type. Use those counts. Do not add items the lookup did not return.",
        parameters={
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
        },
        run=impact_of,
    ),
    AskTool(
        name="aggregate",
        description="Count applications, capabilities, or infrastructure, or sum annual cost. Use for any total, share, renewal window, or criticality question such as the most critical system. A list of vendors is group_by vendor: every named vendor is returned, including vendors with no annual cost. An empty groups list means no vendor is named. filters.criticality is Critical, High, Medium, or Low. by_type counts each type_label. Do not add numbers yourself.",
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
        description="List applications or infrastructure missing a field. field is owner, vendor, annual_cost, renewal_date, lifecycle, or criticality. scope is applications, infrastructure, or estate. Use this for without, missing, or no vendor/owner/cost. count and by_type are the numbers to write. This is not a list of vendors.",
        parameters={
            "type": "object",
            "properties": {
                "scope": {"type": "string"},
                "field": {"type": "string"},
            },
        },
        run=find_gaps,
    ),
    AskTool(
        name="sign_in",
        description=(
            "Single sign-on: which apps and platforms sign in with which (Signs in with links). "
            "With id: what that item signs in with (or own_login true for its own login, no SSO), and what signs in with it. "
            "Without id: each provider with what signs in with it, apps with their own login (no SSO), and not_recorded: "
            "apps and platforms in use with no sign-in recorded. A question about what doesn't use SSO lists not_recorded, "
            "with own_login listed separately. Use the counts as given."
        ),
        parameters={
            "type": "object",
            "properties": {"id": {"type": "string"}},
        },
        run=sign_in,
    ),
    AskTool(
        name="ai_landscape",
        description=(
            "Everywhere AI is used: AI features in tools, AI agents, AI platforms and models, with risk flags F1–F6, "
            "total AI spend and unreviewed count. Use the numbers as given. "
            "An AI feature is a setting on an app, not a separate item: its id is the app's id, so cite the app. "
            "group is features, agents or platforms; flag is F1 (can see customer or financial data), F2 (vendor may train), "
            "F3 (agent has no owner), F4 (agent can change data), F5 (agent uses a person's account) or F6 (same job). "
            "counts and spend are always for the whole workspace. "
            "Customer, financial or personal data questions: answer only from customer_data (the F1 rule, from each app's Holds data). "
            "Can see company data is not customer data. "
            "Use it only when the question has AI wording; a bare \"model\" means the architecture model, not AI."
        ),
        parameters={
            "type": "object",
            "properties": {
                "group": {"type": "string", "enum": ["features", "agents", "platforms"]},
                "flag": {"type": "string", "enum": ["F1", "F2", "F3", "F4", "F5", "F6"]},
            },
        },
        run=ai_landscape,
    ),
]


def tool_specs(include_ai: bool = True) -> list[dict]:
    """include_ai is False when the question has no AI wording, so the model can't route it to ai_landscape."""
    return [
        {"name": tool.name, "description": tool.description, "input_schema": tool.parameters}
        for tool in TOOLS
        if include_ai or tool.name != "ai_landscape"
    ]


def run_tool(bag: ToolBag, name: str, args: dict) -> dict:
    tool = next((item for item in TOOLS if item.name == name), None)
    if not tool:
        return {"error": "unknown_tool", "message": f"{name} is not a lookup Ask can run."}
    try:
        return tool.run(bag, args or {})
    except Exception as exc:  # a bad lookup must not take down the turn
        return {"error": "tool_failed", "message": str(exc)}
