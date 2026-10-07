"""Same rules as apps/web/lib/ai/landscape.ts (spec §6): where AI is used, risk flags F1–F6, spend.

Pure functions over plain dicts. The catalog is a copy of packages/types/src/ai-feature-catalog.json
and JOB_LABELS mirrors AI_JOBS; tests/test_ai_landscape.py keeps both equal and runs the shared
fixture (packages/types/src/fixtures/ai-landscape.fixture.json) through this file.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from app.ai.ask.impact import RISK_EDGE_TYPES, RULES
from app.services.ai_features import AI_FEATURE_TYPES
from app.services.cost_lines import line_annual_cents, object_annual_dollars

CATALOG: list[dict] = json.loads(Path(__file__).with_name("ai_feature_catalog.json").read_text(encoding="utf-8"))

JOB_LABELS: dict[str, str] = {
    "writing_assist": "Writing help",
    "meeting_notes": "Meeting notes",
    "search_answers": "Search and answers",
    "sales_assist": "Sales assist",
    "support_replies": "Support replies",
    "invoice_processing": "Invoice processing",
    "data_analysis": "Data analysis",
    "coding": "Coding",
    "workflow_automation": "Workflow automation",
    "other": "Other",
}

ACTIVE_FEATURE = {"on", "piloting"}
ACTIVE_AGENT = {"active", "under_evaluation"}
FEEDS = {"sends_data_to", "writes", "owns"}
HOLDS_ORDER = ["customer", "financial", "employee", "none"]
KIND_ORDER = ["customer", "financial", "employee"]
CATEGORY_DEFAULTS = {
    "crm": ["customer"],
    "cx": ["customer"],
    "commerce": ["customer"],
    "finance": ["financial"],
    "erp": ["customer", "financial"],
    "hr": ["employee"],
}
PLATFORM_DEFAULTS = {"crm": ["customer"], "erp": ["customer", "financial"]}
TITLES = {
    "F1": ("Can see customer or financial data", "See what each can see"),
    "F2": ("Vendor may train on your data", "Get training terms"),
    "F3": ("Agent has no owner", "Set an owner"),
    "F4": ("Agent can change data", "Review write access"),
    "F5": ("Agent uses a person's account", "Switch to a service account"),
    "F6": ("Two doing the same job", "Compare them"),
}
COUNT_WORDS = {2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six"}


def _s(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _props(obj: dict) -> dict:
    props = obj.get("properties")
    return props if isinstance(props, dict) else {}


def _name_key(name: str) -> tuple[str, str]:
    return (name.casefold(), name)


def normalize_term(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _dollars(cents: float) -> float:
    return math.floor(cents + 0.5) / 100


def f6_title(count: int) -> str:
    return f"{COUNT_WORDS.get(count, str(count))} doing the same job"


def read_holds_data(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    picked = [kind for kind in HOLDS_ORDER if kind in value]
    real = [kind for kind in picked if kind != "none"]
    return real or picked


def record_kinds(record: dict) -> set[str]:
    props = _props(record)
    stored = props.get("holds_data")
    if isinstance(stored, list):
        return {kind for kind in read_holds_data(stored) if kind != "none"}
    if record.get("type") == "cloud_service":
        platform_type = props.get("platform_type") if isinstance(props.get("platform_type"), str) else ""
        return set(PLATFORM_DEFAULTS.get(platform_type, []))
    category = props.get("category").strip().lower() if isinstance(props.get("category"), str) else ""
    return set(CATEGORY_DEFAULTS.get(category, []))


def sensitive_kinds(record: dict, by_id: dict[str, dict], edges: list[dict]) -> tuple[set[str], list[dict]]:
    """§6.2: holds_data or the default; a data_store without holds_data inherits from what feeds it, one hop."""
    if record.get("type") != "data_store" or isinstance(_props(record).get("holds_data"), list):
        return record_kinds(record), []
    kinds: set[str] = set()
    sources: list[dict] = []
    for edge in edges:
        if edge["to_object_id"] != record["id"] or edge["type"] not in FEEDS:
            continue
        source = by_id.get(edge["from_object_id"])
        if not source or source.get("type") in {"data_store", "agent"}:
            continue
        own = record_kinds(source)
        if not own:
            continue
        kinds |= own
        sources.append(source)
    return kinds, sorted(sources, key=lambda item: _name_key(item["name"]))


def _sensitive(kinds: set[str]) -> bool:
    return "customer" in kinds or "financial" in kinds


def _kinds_text(kinds: set[str]) -> str:
    return " and ".join(kind for kind in KIND_ORDER if kind in kinds)


def is_feature_host(obj: dict) -> bool:
    return obj.get("type") in AI_FEATURE_TYPES and obj.get("status") != "retired" and _props(obj).get("lifecycle") != "end_of_life"


def read_features(props: dict) -> list[dict]:
    raw = props.get("ai_features")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict) and _s(item.get("key")) and _s(item.get("name"))]


def host_entries(host: dict, catalog: list[dict]) -> list[dict]:
    tool = normalize_term(_s(_props(host).get("catalog_tool")))
    name = normalize_term(host.get("name") or "")
    found = []
    for entry in catalog:
        if tool and entry.get("tool") and normalize_term(entry["tool"]) == tool:
            found.append(entry)
            continue
        for alias in entry.get("aliases") or []:
            term = normalize_term(alias)
            if term and (name == term or name.startswith(f"{term} ")):
                found.append(entry)
                break
    return found


def _add_on(feature: dict, host: dict) -> float:
    line_id = feature.get("cost_line_id")
    if not line_id:
        return 0
    lines = _props(host).get("cost_lines")
    for line in lines if isinstance(lines, list) else []:
        if isinstance(line, dict) and line.get("id") == line_id:
            return _dollars(line_annual_cents(line))
    return 0


def _collect_features(objects: list[dict], catalog: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    items: list[dict] = []
    review: list[dict] = []
    by_key = {entry["key"]: entry for entry in catalog}
    for host in objects:
        if not is_feature_host(host):
            continue
        stored = read_features(_props(host))
        for feature in stored:
            entry = by_key.get(feature["key"])
            if feature.get("status") == "unreviewed":
                if entry:
                    review.append({"hostId": host["id"], "hostName": host["name"], "entry": entry, "stored": True})
                continue
            items.append(
                {
                    "kind": "feature",
                    "id": f"{host['id']}:{feature['key']}",
                    "hostId": host["id"],
                    "hostName": host["name"],
                    "hostType": host.get("type"),
                    "feature": feature,
                    "entry": entry,
                    "job": (entry.get("job") if entry else None) or "other",
                    "active": feature.get("status") in ACTIVE_FEATURE,
                    "addOn": _add_on(feature, host),
                }
            )
        keys = {feature["key"] for feature in stored}
        for entry in host_entries(host, catalog):
            if entry["key"] not in keys:
                review.append({"hostId": host["id"], "hostName": host["name"], "entry": entry, "stored": False})
    items.sort(key=lambda item: (_name_key(item["hostName"]), _name_key(item["feature"]["name"])))
    review.sort(key=lambda item: (_name_key(item["hostName"]), _name_key(item["entry"]["name"])))
    return [item for item in items if item["active"]], [item for item in items if not item["active"]], review


def _out_of(by_id: dict[str, dict], edges: list[dict], record_id: str, edge_type: str) -> list[dict]:
    found = [by_id[edge["to_object_id"]] for edge in edges if edge["from_object_id"] == record_id and edge["type"] == edge_type and edge["to_object_id"] in by_id]
    return sorted(found, key=lambda item: _name_key(item["name"]))


def _ref(obj: dict) -> dict:
    return {"id": obj["id"], "name": obj["name"]}


def _acts_as(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    kind = _s(value.get("type"))
    return {"type": kind, "name": _s(value.get("name"))} if kind else None


def _owner(obj: dict, by_id: dict[str, dict]) -> str:
    team_id = obj.get("owner_team_id")
    person_id = obj.get("point_of_contact_id")
    team = (by_id.get(team_id) or {}).get("name") if team_id else ""
    person = (by_id.get(person_id) or {}).get("name") if person_id else ""
    team = team or _s(obj.get("owner_team_name"))
    person = person or _s(obj.get("point_of_contact_name"))
    return team or person or _s(obj.get("owner")) or ("Owner set" if team_id or person_id else "")


def _collect_agents(by_id: dict[str, dict], edges: list[dict], objects: list[dict]) -> list[dict]:
    agents = []
    for obj in objects:
        if obj.get("type") != "agent" or obj.get("status") == "retired":
            continue
        props = _props(obj)
        writes = _out_of(by_id, edges, obj["id"], "writes")
        acts_as = _acts_as(props.get("acts_as"))
        agents.append(
            {
                "kind": "agent",
                "id": obj["id"],
                "name": obj["name"],
                "status": _s(obj.get("status")) or "planned",
                "active": _s(obj.get("status")) in ACTIVE_AGENT,
                "job": _s(props.get("job")) or "other",
                "builtWith": [_ref(item) for item in _out_of(by_id, edges, obj["id"], "built_on")],
                "models": [_ref(item) for item in _out_of(by_id, edges, obj["id"], "uses_model")],
                "reads": [_ref(item) for item in _out_of(by_id, edges, obj["id"], "reads")],
                "writes": [_ref(item) for item in writes],
                "actsAs": acts_as,
                "autonomy": _s(props.get("autonomy_level")),
                "owner": _owner(obj, by_id),
                "identityGap": bool(writes) and not acts_as,
                "cost": object_annual_dollars(props) or 0,
            }
        )
    agents.sort(key=lambda item: (not item["active"], _name_key(item["name"])))
    return agents


def _collect_platforms(by_id: dict[str, dict], edges: list[dict], objects: list[dict], agents: list[dict]) -> list[dict]:
    built_on: dict[str, list[dict]] = {}
    for agent in agents:
        for target in agent["builtWith"]:
            built_on.setdefault(target["id"], []).append({"id": agent["id"], "name": agent["name"]})
    items = []
    for obj in objects:
        props = _props(obj)
        platform_type = _s(props.get("platform_type"))
        is_model = obj.get("type") == "ai_model"
        is_ai_platform = obj.get("type") == "cloud_service" and platform_type == "ai_platform"
        runs_agents = obj["id"] in built_on
        if not is_model and not is_ai_platform and not runs_agents:
            continue
        if platform_type == "data_platform":
            continue
        used_by: list[dict] = []
        if is_model:
            for edge in edges:
                if edge["type"] == "uses_model" and edge["to_object_id"] == obj["id"] and edge["from_object_id"] in by_id:
                    used_by.append(_ref(by_id[edge["from_object_id"]]))
        else:
            used_by.extend(built_on.get(obj["id"], []))
            for edge in edges:
                if edge["type"] == "runs_on" and edge["to_object_id"] == obj["id"]:
                    model = by_id.get(edge["from_object_id"])
                    if model and model.get("type") == "ai_model":
                        used_by.append(_ref(model))
        items.append(
            {
                "kind": "platform",
                "id": obj["id"],
                "name": obj["name"],
                "type": obj.get("type"),
                "kindLabel": "Model" if is_model else "AI platform" if is_ai_platform else "Runs agents",
                "counted": (is_model or is_ai_platform) and obj.get("status") != "retired",
                "vendor": _s(props.get("vendor")) or _s(props.get("provider")),
                "usedBy": sorted(used_by, key=lambda item: _name_key(item["name"])),
                "vendorTrains": (_s(props.get("vendor_trains")) or "unknown") if is_model else "",
                "cost": object_annual_dollars(props) or 0,
            }
        )
    items.sort(key=lambda item: (not item["counted"], _name_key(item["name"])))
    return items


def risk_flags(objects: list[dict], edges: list[dict], features: list[dict], agents: list[dict]) -> list[dict]:
    """§6.3 F1–F6."""
    by_id = {obj["id"]: obj for obj in objects}
    flags: list[dict] = []

    def push(flag_id: str, severity: str, item_ids: list[str], why: str, title: str | None = None) -> None:
        default_title, fix = TITLES[flag_id]
        flags.append({"id": flag_id, "severity": severity, "itemIds": item_ids, "why": why, "title": title or default_title, "fix": fix})

    for item in features:
        host = by_id.get(item["hostId"])
        if not host:
            continue
        kinds, _ = sensitive_kinds(host, by_id, edges)
        sees = item["feature"].get("sees_company_data")
        if _sensitive(kinds):
            if sees == "yes":
                push("F1", "high", [item["id"]], f"{item['hostName']} holds {_kinds_text(kinds)} data and this feature can see it.")
            elif sees == "unknown":
                push("F1", "check", [item["id"]], f"{item['hostName']} holds {_kinds_text(kinds)} data. Can this feature see it?")
        trains = item["feature"].get("vendor_trains")
        vendor = item["entry"].get("vendor") if item["entry"] and item["entry"].get("vendor") is not None else None
        if trains == "yes":
            push("F2", "high", [item["id"]], f"{vendor if vendor is not None else item['hostName']} says it may train on your data.")
        elif trains == "unknown":
            push("F2", "check", [item["id"]], f"We don't know if {vendor if vendor is not None else 'the vendor'} trains on your data.")

    active = [agent for agent in agents if agent["active"]]
    for agent in active:
        hit = None
        for target in [*agent["reads"], *agent["writes"]]:
            obj = by_id.get(target["id"])
            if not obj:
                continue
            kinds, sources = sensitive_kinds(obj, by_id, edges)
            if _sensitive(kinds):
                hit = (obj, kinds, sources)
                break
        if hit:
            obj, kinds, sources = hit
            via = f" (it gets data from {', '.join(item['name'] for item in sources)})" if sources else ""
            verb = "writes to" if any(item["id"] == obj["id"] for item in agent["writes"]) else "reads"
            push("F1", "high", [agent["id"]], f"It {verb} {obj['name']}{via}, which holds {_kinds_text(kinds)} data.")
        for model in agent["models"]:
            trains = _s(_props(by_id.get(model["id"]) or {}).get("vendor_trains")) or "unknown"
            if trains == "yes":
                push("F2", "high", [agent["id"]], f"{model['name']}'s vendor may train on what this agent sends it.")
            elif trains == "unknown":
                push("F2", "check", [agent["id"]], f"We don't know if {model['name']}'s vendor trains on your data.")
        if not agent["owner"]:
            push("F3", "high", [agent["id"]], "Nobody is named as its owner.")
        if agent["writes"]:
            targets = ", ".join(item["name"] for item in agent["writes"])
            autonomy = agent["autonomy"]
            if autonomy == "act_autonomously":
                push("F4", "high", [agent["id"]], f"It writes to {targets} on its own, with nobody approving.")
            elif autonomy == "suggest":
                push("F4", "high", [agent["id"]], f'It\'s set to "suggests only" but it has write access to {targets}.')
            elif autonomy == "act_with_approval":
                push("F4", "check", [agent["id"]], f"It writes to {targets} once someone approves.")
            else:
                push("F4", "check", [agent["id"]], f"It writes to {targets} and its autonomy isn't set.")
        if agent["actsAs"] and agent["actsAs"]["type"] == "contact":
            push("F5", "high", [agent["id"]], f"It signs in as {agent['actsAs']['name'] or 'a person'}. If they leave, it stops; and its changes look like theirs.")

    groups: dict[str, list[dict]] = {}
    for item in features:
        groups.setdefault(item["job"], []).append({"id": item["id"], "record": item["hostId"], "name": item["feature"]["name"]})
    for agent in active:
        groups.setdefault(agent["job"], []).append({"id": agent["id"], "record": agent["id"], "name": agent["name"]})
    for job, members in groups.items():
        if not job or job == "other" or len(members) < 2:
            continue
        if len({member["record"] for member in members}) < 2:
            continue
        label = JOB_LABELS[job].lower() if job in JOB_LABELS else job
        names = ", ".join(member["name"] for member in members)
        push("F6", "check", [member["id"] for member in members], f"{names} {'both' if len(members) == 2 else 'all'} do {label}.", f6_title(len(members)))

    return sorted(flags, key=lambda flag: (0 if flag["severity"] == "high" else 1, flag["id"]))


def ai_spend(features: list[dict], agents: list[dict], platforms: list[dict]) -> dict:
    add_ons = sum(item["addOn"] for item in features)
    platform_cost = sum(item["cost"] for item in platforms if item["counted"])
    agent_cost = sum(item["cost"] for item in agents)
    return {"total": add_ons + platform_cost + agent_cost, "addOns": add_ons, "platforms": platform_cost, "agents": agent_cost}


def _lane(edge_type: str, side: str) -> str | None:
    if edge_type in RISK_EDGE_TYPES:
        return "risk"
    rule = RULES.get(edge_type) or {}
    effect = rule.get("when_target_fails") if side == "target" else rule.get("when_source_fails")
    if effect == "direct":
        return "stop"
    if effect == "degraded":
        return "slow"
    return None


def agent_chain(agent_id: str, objects: list[dict], edges: list[dict]) -> list[dict]:
    """§6.6 one agent's chain, with lanes from the impact rules."""
    by_id = {obj["id"]: obj for obj in objects}
    agent = by_id.get(agent_id)
    if not agent:
        return []
    steps: list[dict] = []

    def step(verb: str, target: dict | None, lane: str | None, name: str | None = None, via: str | None = None) -> None:
        item = {"verb": verb, "targetId": target["id"] if target else None, "targetName": name or (target["name"] if target else ""), "lane": lane}
        if via:
            item["via"] = via
        steps.append(item)

    for target in _out_of(by_id, edges, agent_id, "built_on"):
        step("Built with", target, _lane("built_on", "target"))
    for model in _out_of(by_id, edges, agent_id, "uses_model"):
        step("Uses model", model, _lane("uses_model", "target"))
        for host in _out_of(by_id, edges, model["id"], "runs_on"):
            step("Accessed through", host, _lane("runs_on", "target"), via=model["name"])
    for target in _out_of(by_id, edges, agent_id, "reads"):
        step("Reads", target, _lane("reads", "target"))
        if target.get("type") == "data_store":
            for edge in edges:
                if edge["to_object_id"] == target["id"] and edge["type"] == "sends_data_to" and edge["from_object_id"] in by_id:
                    step("Gets data from", by_id[edge["from_object_id"]], _lane("sends_data_to", "source"), via=target["name"])
    for target in _out_of(by_id, edges, agent_id, "writes"):
        step("Writes", target, _lane("writes", "target"))
    acts_as = _acts_as(_props(agent).get("acts_as"))
    if acts_as:
        step("Acts as", None, None, name=acts_as["name"] or acts_as["type"])
    for target in _out_of(by_id, edges, agent_id, "can_call"):
        step("Can call", target, _lane("can_call", "target"))
    return steps


def ai_landscape(objects: list[dict], relationships: list[dict], catalog: list[dict] | None = None) -> dict:
    catalog = CATALOG if catalog is None else catalog
    by_id = {obj["id"]: obj for obj in objects}
    features, off_features, review = _collect_features(objects, catalog)
    agents = _collect_agents(by_id, relationships, objects)
    platforms = _collect_platforms(by_id, relationships, objects, agents)
    flags = risk_flags(objects, relationships, features, agents)
    active_agents = [agent for agent in agents if agent["active"]]
    counts: dict[str, int] = {}
    for flag in flags:
        for item_id in flag["itemIds"]:
            counts[item_id] = counts.get(item_id, 0) + 1
    ranked = sorted(active_agents, key=lambda agent: (-counts.get(agent["id"], 0), _name_key(agent["name"])))
    return {
        "features": features,
        "offFeatures": off_features,
        "agents": agents,
        "platforms": platforms,
        "unreviewed": review,
        "flags": flags,
        "spend": ai_spend(features, active_agents, platforms),
        "places": len(features) + len(active_agents) + sum(1 for item in platforms if item["counted"]),
        "highFlags": sum(1 for flag in flags if flag["severity"] == "high"),
        "chainAgentId": ranked[0]["id"] if ranked else None,
    }


def summarize(objects: list[dict], relationships: list[dict]) -> dict:
    """The projection the shared fixture's `expected` block pins (same as landscape.test-helpers.ts)."""
    result = ai_landscape(objects, relationships)
    chain_id = result["chainAgentId"]
    return {
        "places": result["places"],
        "flags": len(result["flags"]),
        "highFlags": result["highFlags"],
        "spend": result["spend"],
        "features": [item["id"] for item in result["features"]],
        "offFeatures": [item["id"] for item in result["offFeatures"]],
        "agents": [{"id": a["id"], "active": a["active"], "owner": a["owner"], "identityGap": a["identityGap"]} for a in result["agents"]],
        "platforms": [
            {"id": p["id"], "kind": p["kindLabel"], "counted": p["counted"], "cost": p["cost"], "usedBy": [use["id"] for use in p["usedBy"]]}
            for p in result["platforms"]
        ],
        "unreviewed": [f"{row['hostId']}:{row['entry']['key']}" for row in result["unreviewed"]],
        "flagList": [{"id": f["id"], "severity": f["severity"], "itemIds": f["itemIds"], "why": f["why"]} for f in result["flags"]],
        "chainAgentId": chain_id,
        "chain": [f"{s['verb']} {s['targetName']} ({s['lane'] or 'identity'})" for s in agent_chain(chain_id, objects, relationships)] if chain_id else [],
    }
