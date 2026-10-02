"""Same traversal as apps/web/lib/impact/relationship-impact.ts. One rule table."""

from __future__ import annotations

from dataclasses import dataclass

MAX_DEPTH = 4

# Stored type → what happens. Inverse labels are not keys.
# when_target_fails: the stored target failed, so the source is affected.
# when_source_fails: the stored source failed, so the target is affected.
RULES: dict[str, dict] = {
    "calls": {"when_target_fails": "direct", "label": "{source} calls {target}"},
    "part_of": {
        "when_target_fails": "direct",
        "when_source_fails": "degraded",
        "label": "{source} is part of {target}",
    },
    "replaces": {"label": "{source} replaces {target}"},
    "supported_by": {"when_target_fails": "loses_support", "label": "{source} is supported by {target}"},
    "supports": {"when_source_fails": "loses_support", "label": "{source} supports {target}"},
    "runs_on": {"when_target_fails": "direct", "label": "{source} runs on {target}"},
    "built_on": {"when_target_fails": "direct", "label": "{source} is built on {target}"},
    "hosts": {"when_source_fails": "direct", "label": "{source} hosts {target}"},
    "located_at": {"when_target_fails": "direct", "label": "{source} is at {target}"},
    "sends_data_to": {"label": "{source} sends data to {target}"},
}

SEVERITY_ORDER = {"direct": 0, "degraded": 1, "loses_support": 2}


@dataclass
class ImpactEdge:
    type: str
    from_id: str
    to_id: str


def impact_of(names: dict[str, str], edges: list[ImpactEdge], failed_id: str) -> list[dict]:
    unique: list[ImpactEdge] = []
    seen_edges: set[tuple[str, str, str]] = set()
    for edge in edges:
        key = (edge.type, edge.from_id, edge.to_id)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        unique.append(edge)

    adjacent: dict[str, list[ImpactEdge]] = {}
    for edge in unique:
        adjacent.setdefault(edge.from_id, []).append(edge)
        if edge.to_id != edge.from_id:
            adjacent.setdefault(edge.to_id, []).append(edge)
    for listing in adjacent.values():
        listing.sort(key=lambda edge: (edge.type, edge.from_id, edge.to_id))

    hits: dict[str, dict] = {}
    seen = {failed_id}
    queue: list[tuple[str, int, list[dict]]] = [(failed_id, 0, [])]

    while queue:
        current, depth, path = queue.pop(0)
        if depth >= MAX_DEPTH:
            continue
        for edge in adjacent.get(current, []):
            rule = RULES.get(edge.type)
            if not rule:
                continue
            affected = ""
            severity = None
            if edge.to_id == current and rule.get("when_target_fails"):
                affected = edge.from_id
                severity = rule["when_target_fails"]
            elif edge.from_id == current and rule.get("when_source_fails"):
                affected = edge.to_id
                severity = rule["when_source_fails"]
            if not severity or not affected or affected == current or affected in seen:
                continue
            seen.add(affected)
            label = rule["label"].format(
                source=names.get(edge.from_id, edge.from_id),
                target=names.get(edge.to_id, edge.to_id),
            )
            step = {"type": edge.type, "from_id": edge.from_id, "to_id": edge.to_id, "label": label}
            next_path = [*path, step]
            next_depth = depth + 1
            hits[affected] = {
                "id": affected,
                "name": names.get(affected, affected),
                "severity": severity,
                "indirect": next_depth > 1,
                "depth": next_depth,
                "path": next_path,
            }
            queue.append((affected, next_depth, next_path))

    return sorted(hits.values(), key=lambda hit: (hit["depth"], SEVERITY_ORDER[hit["severity"]], hit["name"]))
