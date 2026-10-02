"""Pack a workspace catalog into Firestore-sized pieces. No database or Firebase calls."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

# Stay under Firestore's 1 MiB document limit.
MAX_DOCUMENT_BYTES = 700_000


def _json_size(value: Any) -> int:
    return len(json.dumps(value, default=str).encode("utf-8"))


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _uuid(value: UUID | None) -> str | None:
    if value is None:
        return None
    return str(value)


def object_payload(obj: Any) -> dict[str, Any]:
    return {
        "id": str(obj.id),
        "workspace_id": str(obj.workspace_id),
        "org_id": str(obj.org_id),
        "type": obj.type,
        "name": obj.name,
        "description": obj.description,
        "owner": obj.owner,
        "owner_team_id": _uuid(obj.owner_team_id),
        "owner_team_name": obj.owner,
        "point_of_contact_id": _uuid(obj.point_of_contact_id),
        "point_of_contact_name": obj.point_of_contact_name,
        "status": obj.status,
        "tags": list(obj.tags or []),
        "external_id": obj.external_id,
        "source": obj.source,
        "confidence": obj.confidence,
        "properties": obj.properties or {},
        "created_by": _uuid(obj.created_by),
        "created_at": _iso(obj.created_at),
        "updated_at": _iso(obj.updated_at),
    }


def relationship_payload(rel: Any) -> dict[str, Any]:
    return {
        "id": str(rel.id),
        "workspace_id": str(rel.workspace_id),
        "org_id": str(rel.org_id),
        "type": rel.type,
        "from_object_id": str(rel.from_object_id),
        "from_type": rel.from_type,
        "to_object_id": str(rel.to_object_id),
        "to_type": rel.to_type,
        "attributes": rel.attributes or {},
        "created_by": _uuid(rel.created_by),
        "created_at": _iso(rel.created_at),
    }


def _chunks(items: list[dict[str, Any]], budget: int) -> list[list[dict[str, Any]]]:
    if not items:
        return []
    if _json_size(items) <= budget:
        return [items]
    if len(items) == 1:
        raise ValueError("A single catalog record is larger than Firestore allows")
    mid = len(items) // 2
    return _chunks(items[:mid], budget) + _chunks(items[mid:], budget)


def pack_catalog(
    objects: list[dict[str, Any]],
    relationships: list[dict[str, Any]],
    *,
    version: int,
    built_at: str | None,
) -> dict[str, Any]:
    """One manifest, plus part documents when the estate does not fit in a single write."""
    inline = {
        "version": version,
        "builtAt": built_at,
        "partIds": [],
        "objects": objects,
        "relationships": relationships,
    }
    if _json_size(inline) <= MAX_DOCUMENT_BYTES:
        return {"manifest": inline, "parts": []}

    object_parts = _chunks(objects, MAX_DOCUMENT_BYTES // 2)
    relationship_parts = _chunks(relationships, MAX_DOCUMENT_BYTES // 2)
    parts: list[dict[str, Any]] = []
    for group in relationship_parts:
        parts.append({"id": f"p{len(parts)}", "objects": [], "relationships": group})
    for group in object_parts:
        parts.append({"id": f"p{len(parts)}", "objects": group, "relationships": []})
    return {
        "manifest": {
            "version": version,
            "builtAt": built_at,
            "partIds": [part["id"] for part in parts],
            "objects": [],
            "relationships": [],
        },
        "parts": parts,
    }


def unpack_catalog(manifest: dict[str, Any], parts: list[dict[str, Any]]) -> dict[str, Any]:
    objects = list(manifest.get("objects") or [])
    relationships = list(manifest.get("relationships") or [])
    for part in parts:
        objects.extend(part.get("objects") or [])
        relationships.extend(part.get("relationships") or [])
    return {
        "version": int(manifest.get("version") or 0),
        "builtAt": manifest.get("builtAt"),
        "objects": objects,
        "relationships": relationships,
    }
