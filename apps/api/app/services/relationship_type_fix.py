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
    from_vendor: str = ""


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
    vendor_name: str = ""


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
    """Classify every edge. Mutating codes are a, b, c, e, and h. d, f, and g only report."""
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
                FixAction(extra.id, "e", "delete", _line(original, extra.type, "exact duplicate"))
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

    supplied_sources = {
        edge.from_id
        for edge in survivors
        if edge.type == "supplied_by" and edge.to_type == "external_party"
    }
    handled: set[str] = set()
    for edge in sorted(survivors, key=lambda item: (_stamp(item.created_at), item.id)):
        vendor_flow = (
            edge.type == "sends_data_to"
            and edge.from_type in APPISH
            and edge.to_type == "external_party"
        )
        if not vendor_flow:
            continue
        original = next(item for item in edges if item.id == edge.id)
        handled.add(edge.id)
        if edge.from_id in supplied_sources:
            actions.append(
                FixAction(
                    edge.id,
                    "h",
                    "delete",
                    _line(original, original.type, "delete sends_data_to vendor"),
                )
            )
            deleted.add(edge.id)
            continue
        vendor_text = edge.from_vendor.strip()
        party_name = edge.to_name.strip()
        same_vendor = vendor_text.casefold() == party_name.casefold()
        leave_vendor = bool(vendor_text) and not same_vendor
        note = "change to supplied_by"
        if leave_vendor:
            note = f"change to supplied_by; left properties.vendor ({vendor_text})"
        actions.append(
            FixAction(
                edge.id,
                "h",
                "set_type",
                _line(original, original.type, note),
                type="supplied_by",
                from_id=edge.from_id,
                from_type=edge.from_type,
                to_id=edge.to_id,
                to_type=edge.to_type,
                vendor_name="" if leave_vendor else party_name,
            )
        )
        supplied_sources.add(edge.from_id)

    for edge in survivors:
        if edge.id in reported or edge.id in handled or edge.id in deleted:
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


VENDOR_TEXT_TYPES = frozenset({
    "application",
    "solution",
    "technical_capability",
    "cloud_service",
    "model",
})


@dataclass
class VendorText:
    id: str
    org_id: str
    workspace_id: str
    org_slug: str
    ws_slug: str
    type: str
    name: str
    vendor: str


@dataclass
class PartyRef:
    id: str
    workspace_id: str
    name: str


@dataclass
class VendorBackfill:
    object_id: str
    object_type: str
    object_name: str
    workspace_id: str
    org_id: str
    vendor_name: str
    party_id: str
    line: str


# Same codes and skips as displayVendor / HOSTING_NOT_VENDOR in model-catalog.ts.
_PLATFORM_VENDOR_LABEL = {
    "microsoft": "Microsoft",
    "salesforce": "Salesforce",
    "servicenow": "ServiceNow",
    "sap": "SAP",
    "oracle": "Oracle",
    "google": "Google",
    "amazon": "Amazon",
    "other": "Other",
}
_HOSTING_NOT_VENDOR = frozenset({
    "on_premise",
    "on_prem",
    "self_hosted",
    "public_cloud",
    "private_cloud",
    "hybrid",
    "saas",
    "paas",
    "cloud",
    "other",
})


def clean_vendor_text(raw: str) -> str:
    """Platform option codes become names. Hosting words and other are blank."""
    trimmed = (raw or "").strip()
    if not trimmed or trimmed in _HOSTING_NOT_VENDOR:
        return ""
    return _PLATFORM_VENDOR_LABEL.get(trimmed, trimmed)


def plan_vendor_backfill(
    records: list[VendorText],
    edges: list[FixEdge],
    parties: list[PartyRef],
) -> list[VendorBackfill]:
    """A cleaned text vendor with no supplied_by link gets one.

    ``edges`` must already include planned conversions, so a sends_data_to that
    becomes supplied_by counts as a link and the text vendor is not added again.
    """
    linked = {
        edge.from_id
        for edge in edges
        if edge.type == "supplied_by" and edge.to_type == "external_party"
    }
    parties_by_name = {
        (party.workspace_id, party.name.strip().casefold()): party.id
        for party in parties
        if party.name.strip()
    }
    plans: list[VendorBackfill] = []
    for record in records:
        vendor = clean_vendor_text(record.vendor)
        if record.type not in VENDOR_TEXT_TYPES or not vendor or record.id in linked:
            continue
        party_id = parties_by_name.get((record.workspace_id, vendor.casefold()), "")
        plans.append(
            VendorBackfill(
                object_id=record.id,
                object_type=record.type,
                object_name=record.name,
                workspace_id=record.workspace_id,
                org_id=record.org_id,
                vendor_name=vendor,
                party_id=party_id,
                line=(
                    f"{record.org_slug}/{record.ws_slug} | "
                    f"{record.name} | backfill supplied_by {vendor}"
                ),
            )
        )
        linked.add(record.id)
    return plans
