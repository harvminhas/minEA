"""One-transaction add: create records, fill only empty fields (or overwrite, like PUT), link them."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import ChangeLog, MinEAObject
from app.models.relationships import Relationship
from app.schemas.objects import ObjectCreate, ObjectRead, ObjectUpdate
from app.schemas.relationships import RelationshipCreate, RelationshipRead, identical_relationship, merge_attributes
from app.services.relationship_write import RELATIONSHIP_END_INDEX
from app.services.capability_validation import validate_object_write
from app.services.ai_features import apply_ai_features
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
    # False (default): only fill blank properties (Add flow). True: set them, like PUT /objects/{id}
    # (setup "Where each one lives" changes an app's hosting in the same batch as its links).
    overwrite: bool = False
    owner: str | None = None
    owner_team_name: str | None = None
    point_of_contact_name: str | None = None


class AddBatchRel(BaseModel):
    type: str
    # Optional link attributes (runs_on region). On an existing identical link they are merged in.
    attributes: dict[str, Any] = Field(default_factory=dict)
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


OWNERSHIP_FIELDS = ("owner", "owner_team_name", "point_of_contact_name")


async def _overwrite_update(
    db: AsyncSession,
    obj: MinEAObject,
    item: "AddBatchUpdate",
    *,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    owner_cache: dict | None = None,
) -> bool:
    """Same writes as PUT /objects/{id}: validate + normalize, set ownership, merge properties
    (None clears a key), cost lines, AI features, and a field-diff change log. True if anything
    was sent (PUT also stamps updated_by then)."""
    ownership = {k: getattr(item, k) for k in OWNERSHIP_FIELDS if getattr(item, k) is not None}
    if item.properties is None and not ownership:
        return False
    body = ObjectUpdate(properties=item.properties, **ownership)
    await validate_object_write(
        db,
        workspace_id,
        org_id,
        body,
        object_type=obj.type,
        existing_id=obj.id,
        existing_properties=obj.properties or {},
        existing_name=obj.name,
    )
    if ownership:
        await apply_ownership_write_resolved(
            db, obj, workspace_id=workspace_id, org_id=org_id, user_id=user_id, cache=owner_cache, **ownership
        )
    field_changes: dict[str, Any] = {}
    if body.properties is not None:
        value = body.properties
        try:
            validate_infra_patch(obj.type, value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        merged = {**(obj.properties or {}), **value}
        for key, val in value.items():
            if val is None:
                merged.pop(key, None)
        merged = apply_cost_lines(obj.type, merged)
        merged = apply_ai_features(obj.type, merged, strict="ai_features" in value)
        if merged != (obj.properties or {}):
            field_changes["properties"] = {"old": obj.properties, "new": merged}
        obj.properties = merged
    if field_changes:
        db.add(ChangeLog(
            workspace_id=workspace_id,
            org_id=org_id,
            object_id=obj.id,
            object_type=obj.type,
            action="updated",
            diff={"action_type": "updated_fields", "changes": field_changes},
            performed_by=user_id,
        ))
    obj.updated_by = user_id
    return True


def _has_ownership(item: Any) -> bool:
    return any(getattr(item, k) for k in OWNERSHIP_FIELDS)


def _checked_relationship(item: "AddBatchRel", ids: dict[str, UUID]) -> RelationshipCreate:
    from_id = item.from_id or (ids.get(item.from_key) if item.from_key else None)
    to_id = item.to_id or (ids.get(item.to_key) if item.to_key else None)
    if from_id is None or to_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A link is missing one of its items")
    try:
        return RelationshipCreate(
            type=item.type,
            from_object_id=from_id,
            from_type=item.from_type,
            to_object_id=to_id,
            to_type=item.to_type,
            attributes=item.attributes,
        )
    except ValidationError as exc:
        message = exc.errors()[0]["msg"] if exc.errors() else "That relationship isn't allowed."
        prefix = "Value error, "
        detail = message[len(prefix):] if message.startswith(prefix) else message
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
        ) from exc


async def _save_relationships(
    db: AsyncSession,
    checked: list[RelationshipCreate],
    *,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
) -> list[tuple[Relationship, bool]]:
    """save_relationship for many links in two statements: one multi-row INSERT .. ON CONFLICT DO
    NOTHING RETURNING id, then one SELECT of every row with those ends. A link already stored (or
    repeated in this batch) comes back as that row with created=False, as before."""
    if not checked:
        return []
    ends = [(c.type, c.from_object_id, c.to_object_id) for c in checked]
    first: dict[tuple, UUID] = {}
    values: list[dict[str, Any]] = []
    for c, end in zip(checked, ends):
        if end in first:
            continue
        first[end] = uuid4()
        values.append({
            "id": first[end],
            "workspace_id": workspace_id,
            "org_id": org_id,
            "type": c.type,
            "from_object_id": c.from_object_id,
            "from_type": c.from_type,
            "to_object_id": c.to_object_id,
            "to_type": c.to_type,
            "attributes": c.attributes or {},
            "created_by": user_id,
        })
    inserted = set(
        (
            await db.execute(
                pg_insert(Relationship)
                .values(values)
                .on_conflict_do_nothing(index_elements=list(RELATIONSHIP_END_INDEX))
                .returning(Relationship.id)
            )
        ).scalars().all()
    )
    rows = (
        await db.execute(
            select(Relationship)
            .where(
                Relationship.workspace_id == workspace_id,
                tuple_(Relationship.type, Relationship.from_object_id, Relationship.to_object_id).in_(list(first)),
            )
            .order_by(Relationship.created_at, Relationship.id)
        )
    ).scalars().all()
    out: list[tuple[Relationship, bool]] = []
    claimed: set[UUID] = set()
    for end in ends:
        row = identical_relationship(rows, *end)
        if row is None:
            raise RuntimeError("relationship conflict did not return a row")
        created = row.id in inserted and row.id not in claimed
        if created:
            claimed.add(row.id)
        out.append((row, created))
    return out


async def apply_add_batch(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    body: AddBatchRequest,
    to_read=None,
    read_many=None,
) -> AddBatchResult:
    """All-or-nothing (the caller's transaction). The statement count does not grow with the number
    of plain creates: every new record is one multi-row INSERT .. RETURNING, their change-log rows
    another, and the response is built in one pass (read_many). Updates are loaded in one SELECT and
    links saved in two. Owner names are resolved once per distinct name.

    read_many(db, objects, fresh_ids=..., linked_ids=...) builds every ObjectRead at once; to_read
    (one object at a time) is still accepted for callers that pass it."""
    ids: dict[str, UUID] = {}
    owner_cache: dict = {}
    created_objects: list[MinEAObject] = []
    owned: list[tuple[MinEAObject, AddBatchCreate]] = []

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
            id=uuid4(),
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
            properties=apply_ai_features(create.type, apply_cost_lines(create.type, dict(create.properties or {}))),
            created_by=user_id,
            updated_by=user_id,
        )
        ids[item.key] = obj.id
        created_objects.append(obj)
        if _has_ownership(item):
            owned.append((obj, item))

    if created_objects:
        # One multi-row INSERT .. RETURNING (insertmanyvalues); created_at / updated_at come back
        # with it, so nothing is re-read.
        db.add_all(created_objects)
        await db.flush()
        for obj, item in owned:
            await apply_ownership_write_resolved(
                db,
                obj,
                workspace_id=workspace_id,
                org_id=org_id,
                user_id=user_id,
                owner=item.owner,
                owner_team_name=item.owner_team_name,
                point_of_contact_name=item.point_of_contact_name,
                cache=owner_cache,
            )
        if owned:
            # Owner fields were set after the insert: write them, and reload the server-set
            # updated_at those UPDATEs expired, in one SELECT.
            await db.flush()
            await db.execute(
                select(MinEAObject)
                .where(MinEAObject.id.in_([obj.id for obj, _ in owned]))
                .execution_options(populate_existing=True)
            )
        db.add_all([
            ChangeLog(
                workspace_id=workspace_id,
                org_id=org_id,
                object_id=obj.id,
                object_type=obj.type,
                action="created",
                diff={"action_type": "created_object", "name": obj.name, "type": obj.type},
                performed_by=user_id,
            )
            for obj in created_objects
        ])

    updated: list[MinEAObject] = []
    if body.updates:
        wanted = list(dict.fromkeys(item.id for item in body.updates))
        query = select(MinEAObject).where(
            MinEAObject.id.in_(wanted),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
        if any(item.overwrite for item in body.updates):
            query = query.with_for_update(of=MinEAObject)
        loaded = {obj.id: obj for obj in (await db.execute(query)).scalars().all()}
        if any(item.id not in loaded for item in body.updates):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    for item in body.updates:
        obj = loaded[item.id]
        if item.overwrite:
            if await _overwrite_update(
                db, obj, item, workspace_id=workspace_id, org_id=org_id, user_id=user_id, owner_cache=owner_cache
            ):
                updated.append(obj)
            continue
        patch = empty_property_patch(obj.properties or {}, item.properties)
        changed = False
        if patch:
            merged = apply_ai_features(
                obj.type,
                apply_cost_lines(obj.type, {**(obj.properties or {}), **patch}),
                strict="ai_features" in patch,
            )
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
                cache=owner_cache,
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

    checked = [_checked_relationship(item, ids) for item in body.relationships]
    saved = await _save_relationships(db, checked, workspace_id=workspace_id, org_id=org_id, user_id=user_id)
    rel_ids: list[UUID] = []
    rels: list[Relationship] = []
    for item, (rel, created) in zip(body.relationships, saved):
        if not created and item.attributes:
            rel.attributes = merge_attributes(rel.type, rel.attributes, item.attributes)
        if created:
            rel_ids.append(rel.id)
        rels.append(rel)

    # Updated rows: write them now, then reload their server-set updated_at (onupdate=now()) in one
    # SELECT. Reading an expired column outside the async loader raised MissingGreenlet -> HTTP 500
    # (setup AI step).
    if updated:
        await db.flush()
        await db.execute(
            select(MinEAObject)
            .where(MinEAObject.id.in_([obj.id for obj in updated]))
            .execution_options(populate_existing=True)
        )
    objects = [*created_objects, *updated]
    if read_many is not None:
        linked = {c.from_object_id for c in checked} | {c.to_object_id for c in checked}
        reads = await read_many(db, objects, fresh_ids={obj.id for obj in created_objects}, linked_ids=linked)
    else:
        reads = [await to_read(db, obj) for obj in objects]
    return AddBatchResult(
        objects=reads,
        relationships=[RelationshipRead.model_validate(rel) for rel in rels],
        created_object_ids=[obj.id for obj in created_objects],
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
