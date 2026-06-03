from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import ChangeLog, MinEAObject
from app.schemas.objects import ObjectCreate, ObjectListResponse, ObjectRead, ObjectUpdate
from app.services.authorization import require_limit
from app.services.capability_validation import validate_object_write
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/objects",
    tags=["objects"],
)


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

    q = q.order_by(MinEAObject.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = result.scalars().all()

    return ObjectListResponse(items=list(items), total=total, page=page, page_size=page_size)


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
        owner=body.owner,
        status=body.status,
        tags=body.tags,
        external_id=body.external_id,
        source=body.source,
        properties=body.properties,
        created_by=ctx.user_id,
    )
    db.add(obj)
    await db.flush()

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=obj.id,
        object_type=obj.type,
        action="created",
        diff={"name": obj.name, "type": obj.type},
        performed_by=ctx.user_id,
    ))

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    await db.refresh(obj)
    return obj


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
    return obj


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

    diff: dict[str, Any] = {}
    for field, value in body.model_dump(exclude_none=True).items():
        if field == "properties":
            diff["properties"] = value
            obj.properties = {**obj.properties, **value}
        else:
            diff[field] = value
            setattr(obj, field, value)

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=obj.id,
        object_type=obj.type,
        action="updated",
        diff=diff,
        performed_by=ctx.user_id,
    ))

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    await db.refresh(obj)
    return obj


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

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=obj.id,
        object_type=obj.type,
        action="deleted",
        diff={"name": obj.name},
        performed_by=ctx.user_id,
    ))

    await db.delete(obj)
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
