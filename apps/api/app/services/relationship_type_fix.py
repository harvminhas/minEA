"""Plan and apply the one-off relationship-type cleanup.

Dry-run plans only. Apply mutates the planned rows and nothing else.
A second plan after apply has no mutating actions. Report-only rows stay.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime

from app.schemas.relationships import ALLOWED_TRIPLES

APPISH = frozenset({"application", "solution", "technical_capability"})
HOST_SOURCES = frozenset({"cloud_service", "model"})
HOSTING = frozenset({"runs_on", "built_on"})


@dataclass
class FixEdge:
    id: str
    org_id: str
    workspace_id: str
    org_slug: str
    ws_slug: str
    type: str
    from_id: str
    from_type: str
    from_name: str
    to_id: str
    to_type: str
    to_name: str
    created_at: datetime


@dataclass
class FixAction:
    edge_id: str
    code: str
    kind: str
    line: str
    type: str = ""
    from_id: str = ""
    from_type: str = ""
    to_id: str = ""
    to_type: str = ""


def _stamp(value: datetime | str) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _line(edge: FixEdge, rel_type: str, action: str) -> str:
    return (
        f"{edge.org_slug}/{edge.ws_slug} | "
        f"{edge.from_name} -[{rel_type}]-> {edge.to_name} | {action}"
    )


def _key(edge: FixEdge) -> tuple[str, str, str]:
    return (edge.type, edge.from_id, edge.to_id)


def plan_fixes(edges: list[FixEdge]) -> list[FixAction]:
    """Classify every edge. Mutating codes are a, b, c, and e. d, f, and g only report."""
    working = {edge.id: replace(edge) for edge in edges}
    actions: list[FixAction] = []
    reported: set[str] = set()

    for edge in sorted(edges, key=lambda item: (_stamp(item.created_at), item.id)):
        current = working[edge.id]
        if current.type in HOSTING and current.from_type in APPISH and current.to_type in APPISH:
            actions.append(
                FixAction(
                    edge.id,
                    "a",
                    "set_type",
                    _line(edge, edge.type, "change to depends_on"),
                    type="depends_on",
                    from_id=current.from_id,
                    from_type=current.from_type,
                    to_id=current.to_id,
                    to_type=current.to_type,
                )
            )
            working[edge.id] = replace(current, type="depends_on")
            continue
        hosting_backwards = current.type in HOSTING and current.from_type in HOST_SOURCES
        if hosting_backwards and current.to_type in APPISH:
            actions.append(
                FixAction(
                    edge.id,
                    "b",
                    "swap",
                    _line(edge, edge.type, "swap ends"),
                    type=current.type,
                    from_id=current.to_id,
                    from_type=current.to_type,
                    to_id=current.from_id,
                    to_type=current.from_type,
                )
            )
            working[edge.id] = replace(
                current,
                from_id=current.to_id,
                from_type=current.to_type,
                from_name=current.to_name,
                to_id=current.from_id,
                to_type=current.from_type,
                to_name=current.from_name,
            )
            continue
        if current.type == "calls" and current.from_type in APPISH and current.to_type in APPISH:
            actions.append(
                FixAction(
                    edge.id,
                    "c",
                    "set_type",
                    _line(edge, edge.type, "change to depends_on"),
                    type="depends_on",
                    from_id=current.from_id,
                    from_type=current.from_type,
                    to_id=current.to_id,
                    to_type=current.to_type,
                )
            )
            working[edge.id] = replace(current, type="depends_on")
            continue
        if current.type == "affects" and current.from_type == "initiative":
            actions.append(
                FixAction(
                    edge.id,
                    "d",
                    "report",
                    _line(edge, edge.type, "report affects from initiative"),
                )
            )
            reported.add(edge.id)

    grouped: dict[tuple[str, str, str], list[FixEdge]] = {}
    for edge in working.values():
        grouped.setdefault(_key(edge), []).append(edge)
    deleted: set[str] = set()
    for group in grouped.values():
        ordered = sorted(group, key=lambda item: (_stamp(item.created_at), item.id))
        for extra in ordered[1:]:
            original = next(item for item in edges if item.id == extra.id)
            actions.append(
                FixAction(extra.id, "e", "delete", _line(original, extra.type, "delete duplicate"))
            )
            deleted.add(extra.id)

    survivors = [edge for edge in working.values() if edge.id not in deleted]
    for rel_type in ("built_on", "located_at"):
        by_source: dict[str, list[FixEdge]] = {}
        for edge in survivors:
            if edge.type == rel_type:
                by_source.setdefault(edge.from_id, []).append(edge)
        for group in by_source.values():
            targets = {edge.to_id for edge in group}
            if len(targets) < 2:
                continue
            for edge in group:
                original = next(item for item in edges if item.id == edge.id)
                actions.append(
                    FixAction(
                        edge.id,
                        "f",
                        "report",
                        _line(original, edge.type, "report multiple targets"),
                    )
                )
                reported.add(edge.id)

    for edge in survivors:
        if edge.id in reported:
            continue
        if (edge.type, edge.from_type, edge.to_type) in ALLOWED_TRIPLES:
            continue
        original = next(item for item in edges if item.id == edge.id)
        actions.append(
            FixAction(edge.id, "g", "report", _line(original, edge.type, "report not allowed"))
        )
    return actions


def apply_actions(
    edges: list[FixEdge], actions: list[FixAction]
) -> tuple[list[FixEdge], list[dict]]:
    """Return the rows after mutating actions, plus one change_log payload per mutation."""
    by_id = {edge.id: replace(edge) for edge in edges}
    logs: list[dict] = []
    for action in actions:
        if action.kind == "report":
            continue
        edge = by_id[action.edge_id]
        before = {
            "type": edge.type,
            "from_id": edge.from_id,
            "from_type": edge.from_type,
            "to_id": edge.to_id,
            "to_type": edge.to_type,
        }
        if action.kind == "delete":
            del by_id[action.edge_id]
            after = None
        else:
            updated = replace(
                edge,
                type=action.type or edge.type,
                from_id=action.from_id or edge.from_id,
                from_type=action.from_type or edge.from_type,
                to_id=action.to_id or edge.to_id,
                to_type=action.to_type or edge.to_type,
            )
            if action.kind == "swap":
                updated = replace(updated, from_name=edge.to_name, to_name=edge.from_name)
            by_id[action.edge_id] = updated
            after = {
                "type": updated.type,
                "from_id": updated.from_id,
                "from_type": updated.from_type,
                "to_id": updated.to_id,
                "to_type": updated.to_type,
            }
        logs.append(
            {
                "workspace_id": edge.workspace_id,
                "org_id": edge.org_id,
                "object_id": edge.from_id,
                "object_type": "relationship",
                "action": "relationship_type_fix",
                "diff": {
                    "relationship_id": edge.id,
                    "code": action.code,
                    "before": before,
                    "after": after,
                },
            }
        )
    return list(by_id.values()), logs
