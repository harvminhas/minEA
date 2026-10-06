"""Insert a relationship once. A duplicate end pair returns the row already stored."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.relationships import Relationship
from app.schemas.relationships import identical_relationship

RELATIONSHIP_END_INDEX = ("workspace_id", "type", "from_object_id", "to_object_id")


def relationship_http_status(created: bool) -> int:
    """201 when this call stored a new row. 200 when it returned one that was already there."""
    return 201 if created else 200


def with_vendor_name(properties: dict | None, name: str) -> dict:
    updated = dict(properties or {})
    updated["vendor"] = name
    return updated


def without_vendor_text(properties: dict | None) -> dict:
    """Drop the stored vendor string so Details falls through to + Add."""
    updated = dict(properties or {})
    updated.pop("vendor", None)
    return updated


async def save_relationship(db: AsyncSession, rel: Relationship) -> tuple[Relationship, bool]:
    """Insert, or on a unique-end conflict re-select and return the existing row."""
    rel_id = rel.id or uuid4()
    values = {
        "id": rel_id,
        "workspace_id": rel.workspace_id,
        "org_id": rel.org_id,
        "type": rel.type,
        "from_object_id": rel.from_object_id,
        "from_type": rel.from_type,
        "to_object_id": rel.to_object_id,
        "to_type": rel.to_type,
        "attributes": rel.attributes or {},
        "created_by": rel.created_by,
    }
    inserted = (
        await db.execute(
            pg_insert(Relationship)
            .values(**values)
            .on_conflict_do_nothing(index_elements=list(RELATIONSHIP_END_INDEX))
            .returning(Relationship.id)
        )
    ).scalar_one_or_none()
    if inserted is not None:
        stored = await db.get(Relationship, inserted)
        if stored is None:
            raise RuntimeError("inserted relationship was not readable")
        return stored, True
    found_rows = (
        await db.execute(
            select(Relationship)
            .where(
                Relationship.workspace_id == values["workspace_id"],
                Relationship.type == values["type"],
                Relationship.from_object_id == values["from_object_id"],
                Relationship.to_object_id == values["to_object_id"],
            )
            .order_by(Relationship.created_at, Relationship.id)
        )
    ).scalars().all()
    found = identical_relationship(
        found_rows, values["type"], values["from_object_id"], values["to_object_id"]
    )
    if found is None:
        raise RuntimeError("relationship conflict did not return a row")
    return found, False
