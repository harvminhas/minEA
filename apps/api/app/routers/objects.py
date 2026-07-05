from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import ChangeLog, MinEAObject
from app.models.tenancy import User
from app.schemas.objects import (
    LinkSystemProductRequest,
    ObjectCreate,
    ObjectHistoryEntry,
    ObjectHistoryResponse,
    ObjectListResponse,
    ObjectRead,
    ObjectTechDebtSummary,
    ObjectUpdate,
    SystemProductLinksResponse,
)
from app.services.authorization import require_limit
from app.services.capability_validation import validate_object_write
from app.services.object_history import describe_object_history
from app.services.object_tech_debt import tech_debt_summary_for_object
from app.services.owner_fields import apply_ownership_write_resolved, ownership_from_body, ownership_read_payload
from app.services.system_products import (
    link_system_to_product,
    products_for_system,
    unlink_system_from_product,
)
from app.services.object_stats import (
    DATA_TYPES,
    SYSTEM_TYPES,
    UPDATED_BY_ONLY_TYPES,
    enrich_data_objects,
    enrich_single_data,
    enrich_single_system,
    enrich_single_updated_by,
    enrich_open_tech_debt_counts,
    enrich_tech_debt_view_items,
    enrich_system_objects,
    enrich_updated_by_objects,
)
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/objects",
    tags=["objects"],
)


def _first_name(user: User | None) -> str | None:
    if user is None:
        return None
    if user.full_name:
        return user.full_name.split()[0]
    return user.email.split("@")[0]


async def _to_read(db: AsyncSession, obj: MinEAObject) -> ObjectRead:
    base = ObjectRead.model_validate(obj).model_copy(update=ownership_read_payload(obj))
    if obj.type in SYSTEM_TYPES:
        extra = await enrich_single_system(db, obj)
        return base.model_copy(update=extra)
    if obj.type in DATA_TYPES:
        extra = await enrich_single_data(db, obj)
        return base.model_copy(update=extra)
    if obj.type in UPDATED_BY_ONLY_TYPES:
        extra = await enrich_single_updated_by(db, obj)
        return base.model_copy(update=extra)
    return base


@router.get("", response_model=ObjectListResponse)
async def list_objects(
    type: str | None = Query(None),
    status: str | None = Query(None),
    owner: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ObjectListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    q = select(MinEAObject).where(
        MinEAObject.workspace_id == ctx.workspace.id,
        MinEAObject.org_id == ctx.org_id,
    )
    if type:
        q = q.where(MinEAObject.type == type)
    if status:
        q = q.where(MinEAObject.status == status)
    if owner:
        q = q.where(MinEAObject.owner == owner)
    if search:
        q = q.where(MinEAObject.name.ilike(f"%{search}%"))

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    order_col = MinEAObject.created_at if type == "tech_debt" else MinEAObject.updated_at
    q = q.order_by(order_col.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = list(result.scalars().all())

    system_stats = await enrich_system_objects(db, items)
    updated_by_stats = await enrich_updated_by_objects(db, items)
    data_stats = await enrich_data_objects(db, items)
    debt_stats = await enrich_open_tech_debt_counts(db, items)
    tech_debt_view_stats = (
        await enrich_tech_debt_view_items(db, items) if type == "tech_debt" else {}
    )
    stats_map: dict[UUID, dict[str, Any]] = {}
    for partial in (
        system_stats,
        updated_by_stats,
        data_stats,
        debt_stats,
        tech_debt_view_stats,
    ):
        for obj_id, fields in partial.items():
            stats_map.setdefault(obj_id, {}).update(fields)
    reads: list[ObjectRead] = []
    for obj in items:
        base = ObjectRead.model_validate(obj).model_copy(update=ownership_read_payload(obj))
        extra = stats_map.get(obj.id)
        reads.append(base.model_copy(update=extra) if extra else base)

    return ObjectListResponse(items=reads, total=total, page=page, page_size=page_size)


@router.post("", response_model=ObjectRead, status_code=status.HTTP_201_CREATED)
async def create_object(
    body: ObjectCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> MinEAObject:
    await ctx.require_permission(db, "object.create")
    await require_limit(
        db, ctx.org_id, "max_objects_per_workspace", workspace_id=ctx.workspace.id, pending_delta=1
    )
    assert ctx.workspace

    await validate_object_write(db, ctx.workspace.id, ctx.org_id, body, object_type=body.type)

    obj = MinEAObject(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        type=body.type,
        name=body.name,
        description=body.description,
        owner=None,
        status=body.status,
        tags=body.tags,
        external_id=body.external_id,
        source=body.source,
        properties=body.properties,
        created_by=ctx.user_id,
        updated_by=ctx.user_id,
    )
    db.add(obj)
    await db.flush()
    await apply_ownership_write_resolved(
        db,
        obj,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        **ownership_from_body(body),
    )

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=obj.id,
        object_type=obj.type,
        action="created",
        diff={"action_type": "created_object", "name": obj.name, "type": obj.type},
        performed_by=ctx.user_id,
    ))

    if obj.type == "capability":
        from app.services.domain_history import capability_domain_id, log_capability_added

        domain_id = capability_domain_id(obj)
        if domain_id:
            log_capability_added(
                db,
                workspace_id=ctx.workspace.id,
                org_id=ctx.org_id,
                domain_id=domain_id,
                user_id=ctx.user_id,
                capability_name=obj.name,
                capability_id=obj.id,
            )

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    await db.refresh(obj)
    return await _to_read(db, obj)


@router.get("/{object_id}", response_model=ObjectRead)
async def get_object(
    object_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> MinEAObject:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    return await _to_read(db, obj)


@router.put("/{object_id}", response_model=ObjectRead)
async def update_object(
    object_id: UUID,
    body: ObjectUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> MinEAObject:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")

    await validate_object_write(
        db,
        ctx.workspace.id,
        ctx.org_id,
        body,
        object_type=obj.type,
        existing_id=obj.id,
        existing_properties=obj.properties or {},
        existing_name=obj.name,
    )

    OWNERSHIP_FIELDS = {
        "owner",
        "owner_team_id",
        "owner_team_name",
        "point_of_contact_id",
        "point_of_contact_name",
    }
    updates = body.model_dump(exclude_none=True)
    ownership_updates = {k: updates.pop(k) for k in list(updates) if k in OWNERSHIP_FIELDS}
    if ownership_updates:
        await apply_ownership_write_resolved(
            db,
            obj,
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            user_id=ctx.user_id,
            **ownership_updates,
        )

    field_changes: dict[str, Any] = {}
    for field, value in updates.items():
        if field == "properties":
            merged = {**(obj.properties or {}), **value}
            for key, val in value.items():
                if val is None:
                    merged.pop(key, None)
            if merged != (obj.properties or {}):
                field_changes["properties"] = {"old": obj.properties, "new": merged}
            obj.properties = merged
        else:
            old_val = getattr(obj, field)
            if old_val != value:
                field_changes[field] = {"old": old_val, "new": value}
            setattr(obj, field, value)

    if field_changes:
        db.add(ChangeLog(
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            object_id=obj.id,
            object_type=obj.type,
            action="updated",
            diff={"action_type": "updated_fields", "changes": field_changes},
            performed_by=ctx.user_id,
        ))
        if obj.type == "capability":
            from app.services.domain_history import (
                capability_domain_id,
                domain_relevant_capability_changes,
                log_capability_updated,
            )

            domain_id = capability_domain_id(obj)
            domain_changes = domain_relevant_capability_changes(field_changes)
            if domain_id and domain_changes:
                cap_label = obj.name
                if "name" in domain_changes:
                    cap_label = domain_changes["name"].get("new") or cap_label
                log_capability_updated(
                    db,
                    workspace_id=ctx.workspace.id,
                    org_id=ctx.org_id,
                    domain_id=domain_id,
                    user_id=ctx.user_id,
                    capability_name=cap_label,
                    changes=domain_changes,
                )

    obj.updated_by = ctx.user_id

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    await db.refresh(obj)
    return await _to_read(db, obj)


@router.get("/{object_id}/tech-debt", response_model=ObjectTechDebtSummary)
async def get_object_tech_debt(
    object_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ObjectTechDebtSummary:
    await ctx.require_read(db)
    assert ctx.workspace

    summary = await tech_debt_summary_for_object(
        db, object_id, ctx.workspace.id, ctx.org_id
    )
    return ObjectTechDebtSummary.model_validate(summary)


@router.get("/{object_id}/products", response_model=SystemProductLinksResponse)
async def get_system_products(
    object_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SystemProductLinksResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org_id,
        )
    )
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    if obj.type not in SYSTEM_TYPES:
        return SystemProductLinksResponse(items=[])

    items = await products_for_system(db, object_id, ctx.workspace.id, ctx.org_id)
    return SystemProductLinksResponse(items=items)


@router.post("/{object_id}/products", response_model=SystemProductLinksResponse)
async def link_system_product(
    object_id: UUID,
    body: LinkSystemProductRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SystemProductLinksResponse:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    try:
        await link_system_to_product(
            db, object_id, body.product_id, ctx.workspace.id, ctx.org_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    items = await products_for_system(db, object_id, ctx.workspace.id, ctx.org_id)
    return SystemProductLinksResponse(items=items)


@router.delete("/{object_id}/products/{product_id}", response_model=SystemProductLinksResponse)
async def unlink_system_product(
    object_id: UUID,
    product_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SystemProductLinksResponse:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    try:
        await unlink_system_from_product(
            db, object_id, product_id, ctx.workspace.id, ctx.org_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    items = await products_for_system(db, object_id, ctx.workspace.id, ctx.org_id)
    return SystemProductLinksResponse(items=items)


@router.get("/{object_id}/history", response_model=ObjectHistoryResponse)
async def get_object_history(
    object_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ObjectHistoryResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    entries_result = await db.execute(
        select(ChangeLog)
        .where(
            ChangeLog.workspace_id == ctx.workspace.id,
            ChangeLog.object_id == object_id,
        )
        .order_by(ChangeLog.created_at.desc())
        .limit(50)
    )
    entries = entries_result.scalars().all()

    actor_ids = list({e.performed_by for e in entries if e.performed_by})
    user_map: dict[str, User] = {}
    if actor_ids:
        users_result = await db.execute(select(User).where(User.id.in_(actor_ids)))
        user_map = {str(u.id): u for u in users_result.scalars().all()}

    history: list[ObjectHistoryEntry] = []
    for entry in entries:
        actor_user = user_map.get(str(entry.performed_by)) if entry.performed_by else None
        actor_name = _first_name(actor_user) or "Someone"
        action, detail = describe_object_history(entry)
        history.append(ObjectHistoryEntry(
            id=str(entry.id),
            actor_name=actor_name,
            action=action,
            detail=detail,
            created_at=entry.created_at,
        ))

    return ObjectHistoryResponse(entries=history)


@router.delete("/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_object(
    object_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "object.delete")
    assert ctx.workspace

    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")

    if obj.type == "capability":
        from app.services.domain_history import capability_domain_id, log_capability_removed

        domain_id = capability_domain_id(obj)
        if domain_id:
            log_capability_removed(
                db,
                workspace_id=ctx.workspace.id,
                org_id=ctx.org_id,
                domain_id=domain_id,
                user_id=ctx.user_id,
                capability_name=obj.name,
                capability_id=obj.id,
            )

    if obj.type == "business_domain":
        from app.services.capability_map import delete_capabilities_for_domain

        await delete_capabilities_for_domain(db, ctx.workspace.id, ctx.org_id, obj.id)

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=obj.id,
        object_type=obj.type,
        action="deleted",
        diff={"action_type": "deleted_object", "name": obj.name},
        performed_by=ctx.user_id,
    ))

    await db.delete(obj)
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
