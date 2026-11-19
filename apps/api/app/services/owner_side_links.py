"""Ask graph side_links for owners. Accountabilities are the source of truth.

When a capability, activity, or domain has no owns (or legacy owner-verb) row,
emit a read-only fallback from catalog columns or a business_owner role row so
Ask stays consistent with the UI. Never writes the database.
"""

from __future__ import annotations

from typing import Any, Iterable

OWNER_LINK_KINDS = frozenset({"owns", "manages", "stewards"})
OWNER_ENTITY_KINDS = frozenset({"capability", "business_domain"})


def _sid(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def owner_entity_ids_with_accountability(rows: Iterable[Any]) -> set[str]:
    owned: set[str] = set()
    for row in rows:
        kind = getattr(row, "entity_kind", None) or (row.get("entity_kind") if isinstance(row, dict) else None)
        link = getattr(row, "link_kind", None) or (row.get("link_kind") if isinstance(row, dict) else None)
        entity_id = getattr(row, "entity_id", None) or (row.get("entity_id") if isinstance(row, dict) else None)
        if kind in OWNER_ENTITY_KINDS and link in OWNER_LINK_KINDS and entity_id:
            owned.add(str(entity_id))
    return owned


def extra_owner_side_links(
    *,
    objects: Iterable[Any],
    accountabilities: Iterable[Any],
    role_rows: Iterable[Any] | None = None,
    contact_names: dict[str, str],
    team_names: dict[str, str],
) -> list[dict]:
    """Fallback owner links for records that have no owns accountability yet."""
    owned = owner_entity_ids_with_accountability(accountabilities)
    host_ids: set[str] = set()
    object_list = list(objects)
    for obj in object_list:
        obj_type = getattr(obj, "type", None) or (obj.get("type") if isinstance(obj, dict) else None)
        obj_id = getattr(obj, "id", None) or (obj.get("id") if isinstance(obj, dict) else None)
        if obj_type in OWNER_ENTITY_KINDS and obj_id:
            host_ids.add(str(obj_id))
    items: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    def add(subject_id: str, name: str, subject_type: str, on: str) -> None:
        key = (subject_type, subject_id, on)
        if key in seen:
            return
        seen.add(key)
        items.append(
            {
                "id": subject_id,
                "name": name,
                "type": subject_type,
                "relationship": "owns",
                "on": on,
            }
        )

    for row in role_rows or []:
        link = getattr(row, "link_kind", None) or (row.get("link_kind") if isinstance(row, dict) else None)
        entity_id = getattr(row, "entity_id", None) or (row.get("entity_id") if isinstance(row, dict) else None)
        subject_id = _sid(getattr(row, "subject_id", None) or (row.get("subject_id") if isinstance(row, dict) else None))
        subject_type = getattr(row, "subject_type", None) or (row.get("subject_type") if isinstance(row, dict) else None)
        if link != "business_owner" or not entity_id or not subject_id:
            continue
        on = str(entity_id)
        if on not in host_ids or on in owned:
            continue
        if subject_type == "contact":
            add(subject_id, contact_names.get(subject_id) or subject_id, "contact", on)
        elif subject_type == "team":
            add(subject_id, team_names.get(subject_id) or subject_id, "team", on)

    for obj in object_list:
        obj_type = getattr(obj, "type", None) or (obj.get("type") if isinstance(obj, dict) else None)
        obj_id = getattr(obj, "id", None) or (obj.get("id") if isinstance(obj, dict) else None)
        if obj_type not in OWNER_ENTITY_KINDS or not obj_id:
            continue
        on = str(obj_id)
        if on in owned:
            continue
        poc_id = _sid(
            getattr(obj, "point_of_contact_id", None)
            if not isinstance(obj, dict)
            else obj.get("point_of_contact_id")
        )
        poc_name = (
            getattr(obj, "point_of_contact_name", None)
            if not isinstance(obj, dict)
            else obj.get("point_of_contact_name")
        )
        team_id = _sid(
            getattr(obj, "owner_team_id", None) if not isinstance(obj, dict) else obj.get("owner_team_id")
        )
        team_name = (
            getattr(obj, "owner_team_name", None) if not isinstance(obj, dict) else obj.get("owner_team_name")
        )
        if poc_id:
            add(poc_id, (poc_name or contact_names.get(poc_id) or poc_id), "contact", on)
        if team_id:
            add(team_id, (team_name or team_names.get(team_id) or team_id), "team", on)
    return items
