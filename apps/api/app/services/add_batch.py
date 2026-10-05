"""One-transaction add: create records, fill only empty fields, link them."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import ChangeLog, MinEAObject
from app.models.relationships import Relationship
from app.schemas.objects import ObjectCreate, ObjectRead
from app.schemas.relationships import RelationshipCreate, RelationshipRead
from app.services.capability_validation import validate_object_write
from app.services.cost_lines import apply_cost_lines
from app.services.infra_fields import validate_infra_patch
from app.services.owner_fields import apply_ownership_write_resolved


class AddBatchCreate(BaseModel):
    key: str
    type: str
    name: str
    properties: dict[str, Any] = Field(default_factory=dict)
    owner: str | None = None
    owner_team_name: str | None = None
    point_of_contact_name: str | None = None


class AddBatchUpdate(BaseModel):
    id: UUID
    properties: dict[str, Any] | None = None
    owner: str | None = None
    owner_team_name: str | None = None
    point_of_contact_name: str | None = None


class AddBatchRel(BaseModel):
    type: str
    from_key: str | None = None
    to_key: str | None = None
    from_id: UUID | None = None
    to_id: UUID | None = None
    from_type: str
    to_type: str


class AddBatchRequest(BaseModel):
    creates: list[AddBatchCreate] = Field(default_factory=list)
    updates: list[AddBatchUpdate] = Field(default_factory=list)
    relationships: list[AddBatchRel] = Field(default_factory=list)


class AddBatchResult(BaseModel):
    objects: list[ObjectRead]
    relationships: list[RelationshipRead]
    created_object_ids: list[UUID]
    created_relationship_ids: list[UUID]


class AddUndoRequest(BaseModel):
    object_ids: list[UUID] = Field(default_factory=list)
    relationship_ids: list[UUID] = Field(default_factory=list)


def blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if value in ([], {}):
        return True
    return False


def empty_property_patch(existing: dict | None, incoming: dict | None) -> dict[str, Any]:
    current = existing or {}
    return {key: value for key, value in (incoming or {}).items() if blank(current.get(key))}


async def apply_add_batch(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    body: AddBatchRequest,
    to_read,
) -> AddBatchResult:
    ids: dict[str, UUID] = {}
    created_ids: list[UUID] = []
    created_objects: list[MinEAObject] = []

    for item in body.creates:
        create = ObjectCreate(
            type=item.type,
            name=item.name,
            properties=item.properties,
            owner=item.owner,
            owner_team_name=item.owner_team_name,
            point_of_contact_name=item.point_of_contact_name,
        )
        await validate_object_write(db, workspace_id, org_id, create, object_type=create.type)
        try:
            validate_infra_patch(create.type, create.properties or {})
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        obj = MinEAObject(
            workspace_id=workspace_id,
            org_id=org_id,
            type=create.type,
            name=create.name,
            description=create.description,
            owner=None,
            status=create.status,
            tags=create.tags,
            external_id=create.external_id,
            source=create.source,
            properties=apply_cost_lines(create.type, dict(create.properties or {})),
            created_by=user_id,
            updated_by=user_id,
        )
        db.add(obj)
        await db.flush()
        await apply_ownership_write_resolved(
            db,
            obj,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            owner=item.owner,
            owner_team_name=item.owner_team_name,
            point_of_contact_name=item.point_of_contact_name,
        )
        db.add(ChangeLog(
            workspace_id=workspace_id,
            org_id=org_id,
            object_id=obj.id,
            object_type=obj.type,
            action="created",
            diff={"action_type": "created_object", "name": obj.name, "type": obj.type},
            performed_by=user_id,
        ))
        await db.refresh(obj)
        ids[item.key] = obj.id
        created_ids.append(obj.id)
        created_objects.append(obj)

    updated: list[MinEAObject] = []
    for item in body.updates:
        result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.id == item.id,
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
            )
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
        patch = empty_property_patch(obj.properties or {}, item.properties)
        changed = False
        if patch:
            merged = apply_cost_lines(obj.type, {**(obj.properties or {}), **patch})
            if merged != (obj.properties or {}):
                obj.properties = merged
                changed = True
        ownership: dict[str, Any] = {}
        if blank(obj.owner) and item.owner:
            ownership["owner"] = item.owner
        if blank(getattr(obj, "owner_team_name", None)) and item.owner_team_name:
            ownership["owner_team_name"] = item.owner_team_name
        if blank(getattr(obj, "point_of_contact_name", None)) and item.point_of_contact_name:
            ownership["point_of_contact_name"] = item.point_of_contact_name
        if ownership:
            await apply_ownership_write_resolved(
                db,
                obj,
                workspace_id=workspace_id,
                org_id=org_id,
                user_id=user_id,
                **ownership,
            )
            changed = True
        if changed:
            db.add(ChangeLog(
                workspace_id=workspace_id,
                org_id=org_id,
                object_id=obj.id,
                object_type=obj.type,
                action="updated",
                diff={"action_type": "updated_fields", "changes": {"properties": patch, "ownership": ownership}},
                performed_by=user_id,
            ))
            updated.append(obj)

    rel_ids: list[UUID] = []
    rels: list[Relationship] = []
    for item in body.relationships:
        from_id = item.from_id or (ids.get(item.from_key) if item.from_key else None)
        to_id = item.to_id or (ids.get(item.to_key) if item.to_key else None)
        if from_id is None or to_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A link is missing one of its items")
        try:
            checked = RelationshipCreate(
                type=item.type,
                from_object_id=from_id,
                from_type=item.from_type,
                to_object_id=to_id,
                to_type=item.to_type,
            )
        except ValidationError as exc:
            message = exc.errors()[0]["msg"] if exc.errors() else "That relationship isn't allowed."
            prefix = "Value error, "
            detail = message[len(prefix):] if message.startswith(prefix) else message
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=detail,
            ) from exc
        rel = Relationship(
            workspace_id=workspace_id,
            org_id=org_id,
            type=checked.type,
            from_object_id=checked.from_object_id,
            from_type=checked.from_type,
            to_object_id=checked.to_object_id,
            to_type=checked.to_type,
            attributes={},
            created_by=user_id,
        )
        db.add(rel)
        await db.flush()
        await db.refresh(rel)
        rel_ids.append(rel.id)
        rels.append(rel)

    reads = [await to_read(db, obj) for obj in [*created_objects, *updated]]
    return AddBatchResult(
        objects=reads,
        relationships=[RelationshipRead.model_validate(rel) for rel in rels],
        created_object_ids=created_ids,
        created_relationship_ids=rel_ids,
    )


async def undo_add_batch(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    body: AddUndoRequest,
) -> None:
    if body.relationship_ids:
        result = await db.execute(
            select(Relationship).where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.id.in_(body.relationship_ids),
            )
        )
        for rel in result.scalars().all():
            await db.delete(rel)
    if body.object_ids:
        result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
                MinEAObject.id.in_(body.object_ids),
            )
        )
        for obj in result.scalars().all():
            db.add(ChangeLog(
                workspace_id=workspace_id,
                org_id=org_id,
                object_id=obj.id,
                object_type=obj.type,
                action="deleted",
                diff={"action_type": "deleted_object", "name": obj.name, "undo": True},
                performed_by=user_id,
            ))
            await db.delete(obj)
