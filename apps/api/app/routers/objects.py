from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.objects import ChangeLog, MinEAObject
from app.schemas.objects import ObjectCreate, ObjectListResponse, ObjectRead, ObjectUpdate

router = APIRouter(prefix="/objects", tags=["objects"])


@router.get("", response_model=ObjectListResponse)
async def list_objects(
    workspace_id: UUID = Query(...),
    type: str | None = Query(None),
    status: str | None = Query(None),
    owner: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> ObjectListResponse:
    q = select(MinEAObject).where(
        MinEAObject.workspace_id == workspace_id,
        MinEAObject.org_id == UUID(auth.org_id),
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
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> MinEAObject:
    obj = MinEAObject(
        workspace_id=body.workspace_id,
        org_id=UUID(auth.org_id),
        type=body.type,
        name=body.name,
        description=body.description,
        owner=body.owner,
        status=body.status,
        tags=body.tags,
        external_id=body.external_id,
        source=body.source,
        properties=body.properties,
    )
    db.add(obj)
    await db.flush()

    db.add(ChangeLog(
        workspace_id=body.workspace_id,
        org_id=UUID(auth.org_id),
        object_id=obj.id,
        object_type=obj.type,
        action="created",
        diff={"name": obj.name, "type": obj.type},
    ))

    await db.commit()
    await db.refresh(obj)
    return obj


@router.get("/{object_id}", response_model=ObjectRead)
async def get_object(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> MinEAObject:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.org_id == UUID(auth.org_id),
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
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> MinEAObject:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.org_id == UUID(auth.org_id),
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")

    diff: dict[str, Any] = {}
    for field, value in body.model_dump(exclude_none=True).items():
        if field == "properties":
            diff["properties"] = value
            obj.properties = {**obj.properties, **value}
        else:
            diff[field] = value
            setattr(obj, field, value)

    db.add(ChangeLog(
        workspace_id=obj.workspace_id,
        org_id=UUID(auth.org_id),
        object_id=obj.id,
        object_type=obj.type,
        action="updated",
        diff=diff,
    ))

    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_object(
    object_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> None:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.org_id == UUID(auth.org_id),
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")

    db.add(ChangeLog(
        workspace_id=obj.workspace_id,
        org_id=UUID(auth.org_id),
        object_id=obj.id,
        object_type=obj.type,
        action="deleted",
        diff={"name": obj.name},
    ))

    await db.delete(obj)
    await db.commit()
