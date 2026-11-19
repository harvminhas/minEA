"""Executive assessment fields for capability_health.

Mirrors apps/web/lib/capability-assessment.ts. New values live in objects.properties
and relationships.attributes (no migration).

technology_fit default: when properties.technology_fit is unset, use the weakest
explicitly scored supported_by fitness under the node (strong→4, adequate→3, weak→2).
Missing fitness and explicit "none" do not produce a default. Link-level roll-up still
treats missing fitness as adequate.
"""

from __future__ import annotations

from app.ai.ask.capability_tree import is_activity
from app.schemas.assessment import (
    display_fitness,
    parse_functional_assessment,
    parse_nonfunctional_assessment,
    score_map,
    weakest_nf_under,
    weakest_score,
    dimension_scores_of,
)

POSTURES = ("invest", "tolerate", "migrate", "eliminate")
CRITICALITIES = ("low", "medium", "high", "critical")
DISPOSITIONS = ("keep", "consolidate", "retire", "replace")
TECH_FIT_FROM_WEAKEST = {"strong": 4, "adequate": 3, "weak": 2}
FIT_RANK = {"strong": 3, "adequate": 2, "weak": 1}


def parse_posture(raw) -> str | None:
    value = str(raw or "").strip().lower()
    return value if value in POSTURES else None


def parse_business_criticality(raw) -> str | None:
    value = str(raw or "").strip().lower().replace("_", "-")
    if value in {"tier1", "tier-1", "business-critical"}:
        return "critical"
    return value if value in CRITICALITIES else None


def parse_disposition(raw) -> str | None:
    value = str(raw or "").strip().lower()
    return value if value in DISPOSITIONS else None


def parse_technology_fit(raw) -> int | None:
    try:
        number = int(raw)
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 5 else None


def scored_link_fitness(attributes: dict | None) -> str | None:
    raw = str((attributes or {}).get("fitness") or "").strip().lower()
    return raw if raw in TECH_FIT_FROM_WEAKEST else None


def weaker_scored(a: str | None, b: str | None) -> str | None:
    if not a:
        return b
    if not b:
        return a
    return a if FIT_RANK[a] <= FIT_RANK[b] else b


def owner_is_set(obj: dict | None) -> bool:
    if not obj:
        return False
    return bool(
        str(obj.get("owner") or "").strip()
        or obj.get("owner_team_id")
        or obj.get("point_of_contact_id")
        or str(obj.get("point_of_contact_name") or "").strip()
    )


def _ids_under(capability_id: str, objects: list[dict]) -> set[str]:
    found = {capability_id}
    for obj in objects:
        if obj.get("type") != "capability":
            continue
        if is_activity(obj.get("properties")) and str((obj.get("properties") or {}).get("parent_id") or "") == capability_id:
            found.add(obj["id"])
    return found


def weakest_scored_fitness(capability_id: str, objects: list[dict], edges: list[dict], descendant_ids: set[str] | None = None) -> str | None:
    ids = descendant_ids if descendant_ids is not None else _ids_under(capability_id, objects)
    weakest = None
    for edge in edges:
        if edge.get("type") != "supported_by" or edge.get("from_object_id") not in ids:
            continue
        weakest = weaker_scored(weakest, scored_link_fitness(edge.get("attributes")))
    return weakest


def assess_object(obj: dict | None, objects: list[dict], edges: list[dict], descendant_ids: set[str] | None = None) -> dict:
    props = (obj or {}).get("properties") or {}
    posture = parse_posture(props.get("investment_posture"))
    criticality = parse_business_criticality(props.get("business_criticality"))
    stored = parse_technology_fit(props.get("technology_fit"))
    weakest = weakest_scored_fitness(obj["id"], objects, edges, descendant_ids) if obj else None
    nf = weakest_nf_under(obj["id"], objects, edges, descendant_ids) if obj else None
    derived = nf if nf is not None else TECH_FIT_FROM_WEAKEST.get(weakest or "")
    technology_fit = stored if stored is not None else derived
    source = "stored" if stored is not None else ("default" if derived is not None else None)
    default_from = None
    if stored is None and derived is not None:
        default_from = "nf" if nf is not None else "fitness"
    assessed = bool(obj and owner_is_set(obj) and criticality and technology_fit and posture)
    exposed = bool(assessed and criticality in {"high", "critical"} and (technology_fit or 5) <= 2)
    return {
        "investment_posture": posture,
        "business_criticality": criticality,
        "technology_fit": technology_fit,
        "technology_fit_source": source,
        "technology_fit_default_from": default_from,
        "weakest_scored_fitness": weakest,
        "weakest_nf_score": nf,
        "assessed": assessed,
        "exposed": exposed,
    }


def _app_cost(obj: dict, costs: dict[str, float] | None) -> float:
    if costs and obj["id"] in costs and costs[obj["id"]] is not None:
        try:
            return float(costs[obj["id"]])
        except (TypeError, ValueError):
            pass
    try:
        return float((obj.get("properties") or {}).get("annual_cost") or 0)
    except (TypeError, ValueError):
        return 0.0


def retire_savings(objects: list[dict], edges: list[dict], costs: dict[str, float] | None = None, from_ids: set[str] | None = None) -> dict:
    by_id = {obj["id"]: obj for obj in objects}
    seen: set[str] = set()
    app_ids: list[str] = []
    app_names: list[str] = []
    amount = 0.0
    for edge in edges:
        if edge.get("type") != "supported_by":
            continue
        if from_ids is not None and edge.get("from_object_id") not in from_ids:
            continue
        if parse_disposition((edge.get("attributes") or {}).get("disposition")) != "retire":
            continue
        app_id = edge.get("to_object_id")
        if app_id in seen:
            continue
        app = by_id.get(app_id)
        if not app or app.get("type") not in {"application", "cloud_service"}:
            continue
        seen.add(app_id)
        app_ids.append(app_id)
        app_names.append(app["name"])
        amount += _app_cost(app, costs)
    return {"amount": amount, "app_ids": app_ids, "app_names": app_names}


def dispositions_for(ids: set[str], objects: list[dict], edges: list[dict]) -> list[dict]:
    by_id = {obj["id"]: obj for obj in objects}
    found: dict[str, str | None] = {}
    names: dict[str, str] = {}
    for edge in edges:
        if edge.get("type") != "supported_by" or edge.get("from_object_id") not in ids:
            continue
        app = by_id.get(edge.get("to_object_id"))
        if not app:
            continue
        names[app["id"]] = app["name"]
        current = found.get(app["id"])
        next_value = parse_disposition((edge.get("attributes") or {}).get("disposition"))
        if next_value and not current:
            found[app["id"]] = next_value
        elif app["id"] not in found:
            found[app["id"]] = next_value
    rows = [{"app_id": app_id, "app_name": names[app_id], "disposition": found[app_id]} for app_id in found]
    rows.sort(key=lambda row: row["app_name"])
    return rows


def attach_assessment_scores(graph) -> None:
    """Stamp functional roll-ups and NF scores onto graph records so Ask tools can filter by data."""
    from app.schemas.assessment import (
        parse_functional_assessment,
        parse_nonfunctional_assessment,
        score_map,
        weakest_score,
        NF_APP_TYPES,
    )

    objects = {obj["id"]: obj for obj in getattr(graph, "objects", []) or []}
    children: dict[str, list[str]] = {}
    domain_members: dict[str, list[str]] = {}
    for rec in graph.records.values():
        if rec.parent_id:
            children.setdefault(rec.parent_id, []).append(rec.id)
        if rec.domain_id:
            domain_members.setdefault(rec.domain_id, []).append(rec.id)
        obj = objects.get(rec.id) or {}
        if obj.get("type") in NF_APP_TYPES or rec.raw_type in NF_APP_TYPES or rec.type == "application":
            nf = parse_nonfunctional_assessment((obj.get("properties") or {}).get("nonfunctional_assessment"))
            scores = score_map(nf)
            rec.nonfunctional = scores or None

    # Per-link functional scores, keyed by from_object_id
    link_scores: dict[str, list[dict[str, int]]] = {}
    link_gaps: dict[str, list[str]] = {}
    for edge in graph.edges:
        if edge.relation != "supported_by":
            continue
        assessment = parse_functional_assessment((edge.attributes or {}).get("functional_assessment"))
        scores = score_map(assessment)
        if scores:
            link_scores.setdefault(edge.from_id, []).append(scores)
        if assessment and assessment.get("gaps"):
            link_gaps.setdefault(edge.from_id, []).extend(assessment["gaps"])

    def roll_ids(root_id: str, rec) -> list[str]:
        if rec.raw_type == "business_domain":
            return [root_id, *domain_members.get(root_id, [])]
        found = [root_id]
        for child in children.get(root_id, []):
            found.append(child)
            found.extend(children.get(child, []))
        return found

    def merge(ids: list[str]) -> tuple[dict[str, int] | None, list[str] | None]:
        by_dim: dict[str, list[int]] = {}
        gaps: list[str] = []
        seen_gap: set[str] = set()
        for node_id in ids:
            for scores in link_scores.get(node_id, []):
                for key, value in scores.items():
                    by_dim.setdefault(key, []).append(value)
            for gap in link_gaps.get(node_id, []):
                if gap not in seen_gap:
                    seen_gap.add(gap)
                    gaps.append(gap)
        rolled = {key: weakest_score(values) for key, values in by_dim.items()}
        rolled = {key: value for key, value in rolled.items() if value is not None}
        return (rolled or None, gaps or None)

    for rec in graph.records.values():
        if rec.raw_type not in {"capability", "business_domain"}:
            continue
        rec.functional, rec.assessment_gaps = merge(roll_ids(rec.id, rec))
