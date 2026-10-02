"""Workspace catalog in Firestore. Edits only set a dirty flag. A refresh builds the document."""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import _ensure_firebase
from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.services.catalog_document import object_payload, pack_catalog, relationship_payload, unpack_catalog
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

_COLLECTION = "workspace_catalogs"


async def mark_catalog_dirty(db: AsyncSession, workspace_id: UUID) -> None:
    """Same transaction as the edit. Does not read or write the catalog document."""
    await db.execute(
        text("UPDATE workspaces SET catalog_dirty = TRUE WHERE id = :id"),
        {"id": workspace_id},
    )


async def get_catalog(db: AsyncSession, workspace_id: UUID, org_id: UUID) -> dict[str, Any]:
    state = await _state(db, workspace_id)
    stored = await _read_stored(workspace_id)
    if stored is None:
        return await refresh_catalog(db, workspace_id, org_id)
    stored["dirty"] = bool(state["catalog_dirty"])
    return stored


async def refresh_catalog(db: AsyncSession, workspace_id: UUID, org_id: UUID) -> dict[str, Any]:
    """One builder wins. Everyone else reads the document that builder writes."""
    claimed = await _claim(db, workspace_id)
    await db.commit()
    if not claimed:
        waited = await _wait_for_build(workspace_id)
        if waited is not None:
            return waited
        claimed = await _claim(db, workspace_id, force=True)
        await db.commit()
        if not claimed:
            stored = await _read_stored(workspace_id)
            if stored is not None:
                state = await _state(db, workspace_id)
                stored["dirty"] = bool(state["catalog_dirty"])
                return stored

    try:
        payload = await _load(db, workspace_id, org_id)
        version = int((await _state(db, workspace_id))["catalog_version"] or 0) + 1
        built_at = utc_now().isoformat()
        packed = pack_catalog(
            payload["objects"],
            payload["relationships"],
            version=version,
            built_at=built_at,
        )
        await asyncio.to_thread(_write_stored, str(workspace_id), packed)
    except Exception:
        logger.exception("catalog refresh failed workspace_id=%s", workspace_id)
        await db.execute(
            text(
                """
                UPDATE workspaces
                SET catalog_building = FALSE, catalog_dirty = TRUE
                WHERE id = :id
                """
            ),
            {"id": workspace_id},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The model catalog could not be refreshed. Try again. Firestore must be enabled for this Firebase project.",
        ) from None

    await db.execute(
        text(
            """
            UPDATE workspaces
            SET catalog_building = FALSE,
                catalog_version = :version,
                catalog_built_at = now()
            WHERE id = :id
            """
        ),
        {"id": workspace_id, "version": version},
    )
    await db.commit()
    state = await _state(db, workspace_id)
    return {
        "version": version,
        "builtAt": built_at,
        "dirty": bool(state["catalog_dirty"]),
        "objects": payload["objects"],
        "relationships": payload["relationships"],
    }


async def _load(db: AsyncSession, workspace_id: UUID, org_id: UUID) -> dict[str, list[dict[str, Any]]]:
    objects = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    relationships = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )
    return {
        "objects": [object_payload(obj) for obj in objects.scalars().all()],
        "relationships": [relationship_payload(rel) for rel in relationships.scalars().all()],
    }


async def _state(db: AsyncSession, workspace_id: UUID) -> dict[str, Any]:
    result = await db.execute(
        text(
            """
            SELECT catalog_dirty, catalog_building, catalog_version, catalog_built_at
            FROM workspaces
            WHERE id = :id
            """
        ),
        {"id": workspace_id},
    )
    row = result.mappings().one()
    return dict(row)


async def _claim(db: AsyncSession, workspace_id: UUID, *, force: bool = False) -> bool:
    if force:
        where = "id = :id"
    else:
        where = """
            id = :id
            AND (
                (catalog_dirty = TRUE AND catalog_building = FALSE)
                OR (
                    catalog_building = TRUE
                    AND catalog_building_at < now() - interval '2 minutes'
                )
            )
        """
    result = await db.execute(
        text(
            f"""
            UPDATE workspaces
            SET catalog_dirty = FALSE,
                catalog_building = TRUE,
                catalog_building_at = now()
            WHERE {where}
            RETURNING id
            """
        ),
        {"id": workspace_id},
    )
    return result.first() is not None


async def _wait_for_build(workspace_id: UUID) -> dict[str, Any] | None:
    from app.database import AsyncSessionLocal

    for _ in range(20):
        await asyncio.sleep(0.25)
        async with AsyncSessionLocal() as db:
            state = await _state(db, workspace_id)
        if state["catalog_building"]:
            continue
        stored = await _read_stored(workspace_id)
        if stored is not None:
            stored["dirty"] = bool(state["catalog_dirty"])
            return stored
        return None
    return None


async def _read_stored(workspace_id: UUID) -> dict[str, Any] | None:
    try:
        return await asyncio.to_thread(_read_stored_sync, str(workspace_id))
    except Exception:
        logger.exception("catalog read failed workspace_id=%s", workspace_id)
        return None


def _client():
    _ensure_firebase()
    from firebase_admin import firestore

    return firestore.client()


def _read_stored_sync(workspace_id: str) -> dict[str, Any] | None:
    root = _client().collection(_COLLECTION).document(workspace_id)
    snap = root.get()
    if not snap.exists:
        return None
    manifest = snap.to_dict() or {}
    parts = []
    for part_id in manifest.get("partIds") or []:
        part = root.collection("parts").document(part_id).get()
        if part.exists:
            parts.append(part.to_dict() or {})
    unpacked = unpack_catalog(manifest, parts)
    unpacked["dirty"] = False
    return unpacked


def _write_stored(workspace_id: str, packed: dict[str, Any]) -> None:
    root = _client().collection(_COLLECTION).document(workspace_id)
    root.set(packed["manifest"])
    for part in packed["parts"]:
        root.collection("parts").document(part["id"]).set(
            {"objects": part["objects"], "relationships": part["relationships"]}
        )

