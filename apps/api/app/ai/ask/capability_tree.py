"""3-level capability tree and rolled-up heat (coverage, apps, cost, criticality, fitness, redundancy).

Python mirror of apps/web/lib/capability-tree.ts. An app linked at any level counts once per
ancestor, not once per node it appears under. Tests compare this output to the shared fixture
(packages/types/src/fixtures/capability-tree.fixture.json), which the web tests also run.
"""

from __future__ import annotations

from typing import Iterable

APP_TYPES = {"application", "cloud_service"}

FITNESS_RANK = {"none": 0, "strong": 3, "adequate": 2, "weak": 1}
RISK_ORDER = ["none", "low", "med", "high"]


def is_activity(properties: dict | None) -> bool:
    props = properties or {}
    parent = props.get("parent_id")
    domain = props.get("domain_id")
    return bool(parent) and str(parent) != str(domain or "")


def parse_link_fitness(attributes: dict | None) -> str:
    """Scored fitness on a supported_by link. Missing values count as adequate so existing links still roll up."""
    raw = str((attributes or {}).get("fitness") or "").strip().lower()
    if raw in {"strong", "adequate", "weak", "none"}:
        return raw
    return "adequate"


def _money(obj: dict, costs: dict[str, float] | None) -> float:
    if costs and obj["id"] in costs:
        value = costs[obj["id"]]
        if value is not None:
            try:
                number = float(value)
            except (TypeError, ValueError):
                number = float("nan")
            if number == number:  # not NaN
                return number
    props = obj.get("properties") or {}
    try:
        number = float(props.get("annual_cost"))
    except (TypeError, ValueError):
        return 0.0
    return number if number == number else 0.0


def _risk_of(obj: dict) -> str:
    props = obj.get("properties") or {}
    raw = str(props.get("criticality") or "").lower()
    if raw in {"critical", "high", "business-critical"}:
        return "high"
    if raw in {"medium", "med"}:
        return "med"
    return "low"


def _coverage(covered_leaves: int, leaf_count: int, has_apps: bool) -> str:
    if leaf_count == 0:
        return "covered" if has_apps else "gap"
    if covered_leaves == 0:
        return "partial" if has_apps else "gap"
    if covered_leaves == leaf_count:
        return "covered"
    if covered_leaves / leaf_count >= 0.6:
        return "mostly"
    return "partial"


def _worse_risk(a: str, b: str) -> str:
    return RISK_ORDER[max(RISK_ORDER.index(a), RISK_ORDER.index(b))]


def _weaker_fitness(a: str, b: str) -> str:
    if a == "none":
        return b
    if b == "none":
        return a
    return a if FITNESS_RANK[a] <= FITNESS_RANK[b] else b


def _empty_assessment() -> dict:
    return {
        "fitness": "none",
        "fitnessHint": None,
        "redundancy": "gap",
        "redundancyHint": None,
        "redundancyPlace": None,
        "redundancyApps": [],
    }


def _unique(ids: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in ids:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _finish(node: dict, app_by_id: dict[str, dict], links_by_from: dict[str, list[dict]]) -> dict:
    child_results = [_finish(child, app_by_id, links_by_from) for child in node["children"]]
    from_children = [app_id for child in child_results for app_id in child["uniqueAppIds"]]
    unique = _unique([*node["appIds"], *from_children])
    cost = sum(app_by_id.get(app_id, {}).get("cost", 0) for app_id in unique)
    risk = "none" if not unique else "low"
    for app_id in unique:
        risk = _worse_risk(risk, app_by_id.get(app_id, {}).get("risk", "low"))
    leaf_count = sum(child["leafCount"] for child in child_results) if child_results else 1
    covered_leaves = sum(child["coveredLeaves"] for child in child_results) if child_results else (1 if unique else 0)

    direct = links_by_from.get(node["id"], [])
    fitness_candidates: list[dict] = [
        *[
            {"fitness": link["fitness"], "hint": f"{link['appName']} on {node['name']}"}
            for link in direct
            if link["fitness"] != "none"
        ],
        *[
            {"fitness": child["fitness"], "hint": child["fitnessHint"] or child["name"]}
            for child in child_results
            if child["fitness"] != "none"
        ],
    ]
    fitness = "none"
    fitness_hint = None
    for candidate in fitness_candidates:
        nxt = _weaker_fitness(fitness, candidate["fitness"])
        if nxt != fitness or (nxt == candidate["fitness"] and not fitness_hint):
            fitness = nxt
            fitness_hint = candidate["hint"]
    if fitness == "none":
        fitness_hint = None

    direct_unique = _unique(link["appId"] for link in direct)
    self_overlap = len(direct_unique) >= 2
    inherited = [child for child in child_results if child["redundancy"] in {"two", "many"}]
    redundancy = "gap"
    redundancy_hint = None
    redundancy_place = None
    redundancy_apps: list[str] = []
    if self_overlap:
        redundancy = "many" if len(direct_unique) >= 3 else "two"
        redundancy_place = node["name"]
        seen_apps: set[str] = set()
        redundancy_apps = []
        for link in direct:
            if link["appId"] in seen_apps:
                continue
            seen_apps.add(link["appId"])
            redundancy_apps.append(link["appName"])
        redundancy_hint = f"{len(direct_unique)} apps on {node['name']}"
    for child in inherited:
        band = "many" if child["redundancy"] == "many" else "two"
        if redundancy == "gap" or (band == "many" and redundancy == "two"):
            redundancy = band
            redundancy_hint = child["redundancyHint"]
            redundancy_place = child["redundancyPlace"]
            redundancy_apps = list(child["redundancyApps"])
    if redundancy == "gap" and unique:
        redundancy = "none"
        redundancy_hint = None
        redundancy_place = None
        redundancy_apps = []

    return {
        **node,
        "children": child_results,
        "uniqueAppIds": unique,
        "cost": cost,
        "risk": risk,
        "leafCount": leaf_count,
        "coveredLeaves": covered_leaves,
        "coverage": _coverage(covered_leaves, leaf_count, len(unique) > 0),
        "fitness": fitness,
        "fitnessHint": fitness_hint,
        "redundancy": redundancy,
        "redundancyHint": redundancy_hint,
        "redundancyPlace": redundancy_place,
        "redundancyApps": redundancy_apps,
    }


def build_capability_tree(
    objects: list[dict],
    edges: list[dict],
    costs: dict[str, float] | None = None,
) -> list[dict]:
    apps = [obj for obj in objects if obj.get("type") in APP_TYPES]
    app_by_id = {
        app["id"]: {"cost": _money(app, costs), "risk": _risk_of(app), "name": app["name"]}
        for app in apps
    }
    linked: dict[str, list[str]] = {}
    links_by_from: dict[str, list[dict]] = {}
    app_ids = set(app_by_id)
    for edge in edges:
        if edge.get("type") != "supported_by" or edge.get("to_object_id") not in app_ids:
            continue
        source = edge["from_object_id"]
        linked.setdefault(source, []).append(edge["to_object_id"])
        app = app_by_id[edge["to_object_id"]]
        links_by_from.setdefault(source, []).append(
            {"appId": edge["to_object_id"], "appName": app["name"], "fitness": parse_link_fitness(edge.get("attributes"))}
        )

    domains = sorted(
        [obj for obj in objects if obj.get("type") == "business_domain"],
        key=lambda obj: obj["name"],
    )
    caps = [obj for obj in objects if obj.get("type") == "capability"]
    known_domains = {domain["id"] for domain in domains}
    l2: list[dict] = []
    l3_by_parent: dict[str, list[dict]] = {}
    for cap in caps:
        if is_activity(cap.get("properties")):
            parent = str((cap.get("properties") or {}).get("parent_id") or "")
            l3_by_parent.setdefault(parent, []).append(cap)
        else:
            l2.append(cap)

    def make(obj: dict, level: int, domain_id: str | None, parent_id: str | None, children: list[dict]) -> dict:
        return {
            "id": obj["id"],
            "name": obj["name"],
            "level": level,
            "domainId": domain_id,
            "parentId": parent_id,
            "children": children,
            "appIds": _unique(linked.get(obj["id"], [])),
            "uniqueAppIds": [],
            "cost": 0,
            "risk": "none",
            "coverage": "gap",
            "leafCount": 0,
            "coveredLeaves": 0,
            **_empty_assessment(),
        }

    def l2_under(domain_id: str | None) -> list[dict]:
        selected: list[dict] = []
        for cap in l2:
            did = str((cap.get("properties") or {}).get("domain_id") or "")
            if domain_id:
                if did == domain_id:
                    selected.append(cap)
            elif not did or did not in known_domains:
                selected.append(cap)
        selected.sort(key=lambda cap: cap["name"])
        nodes: list[dict] = []
        for cap in selected:
            kids = sorted(l3_by_parent.get(cap["id"], []), key=lambda act: act["name"])
            children = [make(act, 3, domain_id, cap["id"], []) for act in kids]
            nodes.append(make(cap, 2, domain_id, domain_id, children))
        return nodes

    trees = [make(domain, 1, domain["id"], None, l2_under(domain["id"])) for domain in domains]
    orphans = l2_under(None)
    if orphans:
        trees.append(
            {
                "id": "no-domain",
                "name": "No domain",
                "level": 1,
                "domainId": None,
                "parentId": None,
                "children": orphans,
                "appIds": [],
                "uniqueAppIds": [],
                "cost": 0,
                "risk": "none",
                "coverage": "gap",
                "leafCount": 0,
                "coveredLeaves": 0,
                **_empty_assessment(),
            }
        )
    return [_finish(node, app_by_id, links_by_from) for node in trees]


def flatten(nodes: list[dict], depth: str) -> list[dict]:
    if depth == "l1":
        return list(nodes)
    if depth == "l2":
        return [child for domain in nodes for child in domain["children"]]
    out: list[dict] = []
    for domain in nodes:
        for cap in domain["children"]:
            out.extend(cap["children"] if cap["children"] else [cap])
    return out


def walk(nodes: list[dict], path: list[str] | None = None) -> list[dict]:
    """Every node with its parent path (ancestor names only)."""
    rows: list[dict] = []
    prefix = path or []
    for node in nodes:
        rows.append({**node, "path": list(prefix), "children": node["children"]})
        rows.extend(walk(node["children"], [*prefix, node["name"]]))
    return rows
