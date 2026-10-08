"""Change an application into a platform, or the other way, without a new record."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.data_layer import DataLink
from app.models.objects import ChangeLog, MinEAObject
from app.models.people import PeopleAccountability
from app.models.relationships import Relationship
from app.schemas.relationships import triple_allowed
from app.services.ai_features import apply_ai_features, strip_ai_keys
from app.services.cost_lines import apply_cost_lines
from app.services.owner_accountability_sync import _OBJECT_OWNER_ACCOUNTABILITY
from app.services.system_properties import SYSTEM_OBJECT_TYPES, normalize_system_properties

_APPISH = frozenset({"application", "solution", "technical_capability"})
_SWITCHABLE = _APPISH | {"cloud_service"}
_HOST = frozenset({"built_on", "runs_on"})
# Same forward / reverse phrases as formatRelationshipTriple.
_LABELS: dict[str, tuple[str, str]] = {
    "depends_on": ("Depends on", "Needed by"),
    "part_of": ("Part of", "Includes"),
    "calls": ("Calls", "Called by"),
    "uses": ("Makes use of", "Made use of"),
    "contains": ("Contains", "Stored in"),
    "connects": ("Uses", "Used by flow"),
    "routes": ("Routes to", "Routed from"),
    "hosts": ("Gateway for", "Behind gateway"),
    "carries": ("Carries", "Carried by"),
    "supported_by": ("Supported by", "Supports"),
    "exposes": ("Exposes", "Exposed by"),
    "publishes": ("Publishes", "Published by"),
    "consumes": ("Consumes", "Consumed by"),
    "subscribes": ("Subscribes to", "Subscribed by"),
    "reads": ("Reads from", "Read by"),
    "writes": ("Writes to", "Written to by"),
    "creates": ("Creates", "Created by"),
    "updates": ("Updates", "Updated by"),
    "owns": ("Owns", "Owned by"),
    "belongs_to": ("Belongs to", "Contains entity/store"),
    "runs_on": ("Runs on", "Runs"),
    "built_on": ("Built on", "Platform for"),
    "affects": ("Affects", "Affected by"),
    "resolves": ("Resolves", "Resolved by"),
    "replaces": ("Replaces", "Replaced by"),
    "uses_model": ("Uses model", "Used by"),
    "can_call": ("Can call", "Callable by"),
    "supports": ("Provides support", "Receives support"),
    "escalates_to": ("Escalates to", "Escalated from"),
    "accesses": ("Accesses", "Accessed by"),
    "connects_to": ("Connects to", "Connected through"),
    "located_at": ("Located at", "Location of"),
    "supplied_by": ("Supplied by", "Supplies"),
    "authenticates_via": ("Signs in with", "Sign-in for"),
    "sends_data_to": ("Sends data to", "Gets data from"),
}


@dataclass
class SwitchLink:
    id: str
    type: str
    from_object_id: str
    from_type: str
    to_object_id: str
    to_type: str


@dataclass
class SwitchInvalid:
    id: str
    line: str


@dataclass
class SwitchMerged:
    id: str
    line: str


@dataclass
class SwitchPlan:
    object_id: str
    kept: list[SwitchLink]
    remapped: list[SwitchLink]
    invalid: list[SwitchInvalid]
    merged: list[SwitchMerged]


def _fit(rel_type: str, from_type: str, to_type: str) -> str | None:
    if triple_allowed(rel_type, from_type, to_type):
        return rel_type
    if rel_type not in _HOST:
        return None
    other = "runs_on" if rel_type == "built_on" else "built_on"
    if triple_allowed(other, from_type, to_type):
        return other
    return None


def _name_line(rel_type: str, outbound: bool, other_name: str) -> str:
    forward, reverse = _LABELS.get(rel_type, (rel_type.replace("_", " "), rel_type.replace("_", " ")))
    return f"{forward if outbound else reverse} {other_name}"


def plan_type_switch(
    object_id: str,
    current_type: str,
    new_type: str,
    links: list[SwitchLink],
    names: dict[str, str],
) -> SwitchPlan:
    """Keep the same record id. Remap built_on and runs_on when that stays valid.

    A remap that would duplicate a link already kept is a merge. Anything that
    would no longer be allowed is listed and left in place until the caller
    confirms those ids.
    """
    if current_type not in _SWITCHABLE or new_type not in _SWITCHABLE:
        raise ValueError("only an application or a platform can change type")
    if current_type == "cloud_service" and new_type != "application":
        raise ValueError("a platform becomes an application")
    if current_type in _APPISH and new_type != "cloud_service":
        raise ValueError("an application becomes a platform")

    invalid: list[SwitchInvalid] = []
    fitted: list[tuple[SwitchLink, str, str, str, str, bool]] = []
    for link in links:
        if link.from_object_id != object_id and link.to_object_id != object_id:
            continue
        outbound = link.from_object_id == object_id
        from_type = new_type if outbound else link.from_type
        to_type = new_type if link.to_object_id == object_id else link.to_type
        nxt = _fit(link.type, from_type, to_type)
        other_id = link.to_object_id if outbound else link.from_object_id
        other_name = names.get(other_id, "Untitled")
        if nxt is None:
            invalid.append(SwitchInvalid(link.id, _name_line(link.type, outbound, other_name)))
            continue
        fitted.append((link, nxt, from_type, to_type, other_name, outbound))

    groups: dict[tuple[str, str, str], list[tuple[SwitchLink, str, str, str, str, bool]]] = {}
    for item in fitted:
        link, nxt, _from_type, _to_type, _other_name, _outbound = item
        groups.setdefault((nxt, link.from_object_id, link.to_object_id), []).append(item)

    kept: list[SwitchLink] = []
    remapped: list[SwitchLink] = []
    merged: list[SwitchMerged] = []
    for group in groups.values():
        keeper = next((item for item in group if item[0].type == item[1]), group[0])
        for item in group:
            link, nxt, from_type, to_type, other_name, outbound = item
            if item is not keeper:
                merged.append(SwitchMerged(link.id, f"merged into {_name_line(nxt, outbound, other_name)}"))
                continue
            updated = SwitchLink(
                id=link.id,
                type=nxt,
                from_object_id=link.from_object_id,
                from_type=from_type,
                to_object_id=link.to_object_id,
                to_type=to_type,
            )
            if link.type == nxt:
                kept.append(updated)
            else:
                remapped.append(updated)
    return SwitchPlan(
        object_id=object_id,
        kept=kept,
        remapped=remapped,
        invalid=invalid,
        merged=merged,
    )


def relationship_snapshot(rel: Relationship) -> dict[str, Any]:
    """Full row, so a deleted or remapped link can be put back."""
    created = rel.created_at
    created_by = rel.created_by
    return {
        "id": str(rel.id),
        "workspace_id": str(rel.workspace_id),
        "org_id": str(rel.org_id),
        "type": rel.type,
        "from_object_id": str(rel.from_object_id),
        "from_type": rel.from_type,
        "to_object_id": str(rel.to_object_id),
        "to_type": rel.to_type,
        "attributes": dict(rel.attributes or {}),
        "created_by": None if created_by is None else str(created_by),
        "created_at": created.isoformat() if created is not None and hasattr(created, "isoformat") else None,
    }


def _kind_aliases(object_type: str) -> set[str]:
    aliases = {object_type}
    mapped = _OBJECT_OWNER_ACCOUNTABILITY.get(object_type)
    if mapped:
        aliases.add(mapped[0])
    if object_type in _APPISH:
        aliases.update(_APPISH)
    return aliases


def unread_on_platform(new_type: str, link_kind: str, table: str) -> bool:
    """A platform has no reader for an application's manages or managed_by row."""
    if new_type != "cloud_service":
        return False
    if table == "people_accountabilities" and link_kind == "manages":
        return True
    return table == "data_links" and link_kind == "managed_by"


def _stored_kind(object_type: str) -> str:
    mapped = _OBJECT_OWNER_ACCOUNTABILITY.get(object_type)
    return mapped[0] if mapped else object_type


def retarget_reference(row: DataLink | PeopleAccountability, object_id: str, old_type: str, new_type: str) -> None:
    """Point data-layer and people rows at the type this record is becoming."""
    aliases = _kind_aliases(old_type)
    if str(row.entity_id) == object_id and row.entity_kind in aliases:
        row.entity_kind = _stored_kind(new_type)
    if str(row.subject_id) == object_id and row.subject_type in aliases:
        row.subject_type = new_type


def properties_for_type(object_type: str, properties: dict | None) -> dict:
    """Drop the platform mirror, then run the new type's property normalization."""
    props = dict(properties or {})
    props.pop("platform", None)
    if object_type in SYSTEM_OBJECT_TYPES:
        props = normalize_system_properties(props)
    return apply_ai_features(object_type, strip_ai_keys(object_type, apply_cost_lines(object_type, props)), strict=False)


def cleared_platform_mirror(properties: dict | None, platform_id: str) -> dict | None:
    """Properties with the platform mirror removed when it points at this record."""
    props = dict(properties or {})
    platform = props.get("platform")
    if not isinstance(platform, dict):
        return None
    if str(platform.get("platform_id") or "") != platform_id:
        return None
    props.pop("platform", None)
    return props


def _reference_snapshot(row: DataLink | PeopleAccountability) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "subject_type": row.subject_type,
        "subject_id": str(row.subject_id),
        "entity_kind": row.entity_kind,
        "entity_id": str(row.entity_id),
        "link_kind": row.link_kind,
    }


def _touches(row: DataLink | PeopleAccountability, object_id: str) -> bool:
    return str(row.entity_id) == object_id or str(row.subject_id) == object_id


async def _rewrite_references(
    db: AsyncSession,
    obj: MinEAObject,
    previous: str,
    new_type: str,
    user_id: UUID | None,
) -> None:
    object_id = str(obj.id)
    tables: list[tuple[str, list[DataLink] | list[PeopleAccountability]]] = [
        (
            "data_links",
            list(
                (
                    await db.execute(
                        select(DataLink).where(
                            DataLink.workspace_id == obj.workspace_id,
                            or_(DataLink.entity_id == obj.id, DataLink.subject_id == obj.id),
                        )
                    )
                ).scalars().all()
            ),
        ),
        (
            "people_accountabilities",
            list(
                (
                    await db.execute(
                        select(PeopleAccountability).where(
                            PeopleAccountability.workspace_id == obj.workspace_id,
                            or_(
                                PeopleAccountability.entity_id == obj.id,
                                PeopleAccountability.subject_id == obj.id,
                            ),
                        )
                    )
                ).scalars().all()
            ),
        ),
    ]
    for table, rows in tables:
        for row in rows:
            if unread_on_platform(new_type, row.link_kind, table) and _touches(row, object_id):
                _log(
                    db,
                    workspace_id=obj.workspace_id,
                    org_id=obj.org_id,
                    object_id=obj.id,
                    object_type=previous,
                    user_id=user_id,
                    action="reference_removed",
                    diff={"action_type": "reference_removed", "table": table, "row": _reference_snapshot(row)},
                )
                await db.delete(row)
                continue
            before = _reference_snapshot(row)
            retarget_reference(row, object_id, previous, new_type)
            after = _reference_snapshot(row)
            if before == after:
                continue
            _log(
                db,
                workspace_id=obj.workspace_id,
                org_id=obj.org_id,
                object_id=obj.id,
                object_type=new_type,
                user_id=user_id,
                action="reference_retargeted",
                diff={"action_type": "reference_retargeted", "table": table, "before": before, "after": after},
            )


def _log(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    object_id: UUID,
    object_type: str,
    user_id: UUID | None,
    action: str,
    diff: dict[str, Any],
) -> None:
    db.add(
        ChangeLog(
            workspace_id=workspace_id,
            org_id=org_id,
            object_id=object_id,
            object_type=object_type,
            action=action,
            diff=diff,
            performed_by=user_id,
        )
    )


async def apply_type_switch(
    db: AsyncSession,
    obj: MinEAObject,
    rows: list[Relationship],
    plan: SwitchPlan,
    *,
    new_type: str,
    user_id: UUID | None,
) -> tuple[list[Relationship], list[UUID]]:
    """Delete, remap, retarget, and normalize in the caller's transaction."""
    previous = obj.type
    by_id = {str(rel.id): rel for rel in rows}
    merged_lines = {item.id: item.line for item in plan.merged}
    removed: list[UUID] = []
    for item_id in [item.id for item in plan.invalid] + [item.id for item in plan.merged]:
        rel = by_id.get(item_id)
        if rel is None:
            continue
        diff: dict[str, Any] = {
            "action_type": "relationship_deleted",
            "relationship": relationship_snapshot(rel),
        }
        if item_id in merged_lines:
            diff["merged_into"] = merged_lines[item_id]
        _log(
            db,
            workspace_id=obj.workspace_id,
            org_id=obj.org_id,
            object_id=obj.id,
            object_type=previous,
            user_id=user_id,
            action="relationship_deleted",
            diff=diff,
        )
        await db.delete(rel)
        removed.append(rel.id)
    if removed:
        await db.flush()

    kept: list[Relationship] = []
    for item in [*plan.kept, *plan.remapped]:
        rel = by_id[item.id]
        before = relationship_snapshot(rel)
        rel.type = item.type
        rel.from_type = item.from_type
        rel.to_type = item.to_type
        after = relationship_snapshot(rel)
        if before != after:
            action = "relationship_remapped" if before["type"] != after["type"] else "relationship_updated"
            _log(
                db,
                workspace_id=obj.workspace_id,
                org_id=obj.org_id,
                object_id=obj.id,
                object_type=new_type,
                user_id=user_id,
                action=action,
                diff={"action_type": action, "before": before, "after": after},
            )
        kept.append(rel)

    await _rewrite_references(db, obj, previous, new_type, user_id)

    mirrors = (
        await db.execute(
            select(MinEAObject).where(
                MinEAObject.workspace_id == obj.workspace_id,
                MinEAObject.org_id == obj.org_id,
                MinEAObject.type.in_(tuple(_APPISH)),
                MinEAObject.id != obj.id,
            )
        )
    ).scalars().all()
    for other in mirrors:
        cleared = cleared_platform_mirror(other.properties, str(obj.id))
        if cleared is None:
            continue
        platform = (other.properties or {}).get("platform")
        other.properties = cleared
        flag_modified(other, "properties")
        _log(
            db,
            workspace_id=obj.workspace_id,
            org_id=obj.org_id,
            object_id=obj.id,
            object_type=new_type,
            user_id=user_id,
            action="platform_mirror_cleared",
            diff={
                "action_type": "platform_mirror_cleared",
                "object_id": str(other.id),
                "platform": platform,
            },
        )

    obj.properties = properties_for_type(new_type, obj.properties)
    flag_modified(obj, "properties")
    obj.type = new_type
    obj.updated_by = user_id
    _log(
        db,
        workspace_id=obj.workspace_id,
        org_id=obj.org_id,
        object_id=obj.id,
        object_type=new_type,
        user_id=user_id,
        action="updated",
        diff={"action_type": "updated_fields", "changes": {"type": {"old": previous, "new": new_type}}},
    )
    return kept, removed
