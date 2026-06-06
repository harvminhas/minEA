from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.schemas.relationships import RelationshipCreate, RelationshipRead
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/relationships",
    tags=["relationships"],
)


@router.get("", response_model=list[RelationshipRead])
async def list_relationships(
    from_object_id: UUID | None = Query(None),
    to_object_id: UUID | None = Query(None),
    type: str | None = Query(None),
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[Relationship]:
    await ctx.require_read(db)
    assert ctx.workspace

    q = select(Relationship).where(
        Relationship.workspace_id == ctx.workspace.id,
        Relationship.org_id == ctx.org_id,
    )
    if from_object_id:
        q = q.where(Relationship.from_object_id == from_object_id)
    if to_object_id:
        q = q.where(Relationship.to_object_id == to_object_id)
    if type:
        q = q.where(Relationship.type == type)

    result = await db.execute(q.order_by(Relationship.created_at.desc()))
    return list(result.scalars().all())


async def _require_object_in_workspace(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    object_id: UUID,
    role: str,
) -> None:
    result = await db.execute(
        select(MinEAObject.id).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{role} object {object_id} was not found in this workspace",
        )


@router.post("", response_model=RelationshipRead, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    body: RelationshipCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> Relationship:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    await _require_object_in_workspace(
        db,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=body.from_object_id,
        role="Source",
    )
    await _require_object_in_workspace(
        db,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=body.to_object_id,
        role="Target",
    )

    rel = Relationship(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        type=body.type,
        from_object_id=body.from_object_id,
        from_type=body.from_type,
        to_object_id=body.to_object_id,
        to_type=body.to_type,
        attributes=body.attributes,
        created_by=ctx.user_id,
    )
    db.add(rel)
    await db.flush()
    await db.refresh(rel)
    return rel


@router.delete("/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    relationship_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    result = await db.execute(
        select(Relationship).where(
            Relationship.id == relationship_id,
            Relationship.workspace_id == ctx.workspace.id,
            Relationship.org_id == ctx.org_id,
        )
    )
    rel = result.scalar_one_or_none()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")
    await db.delete(rel)
    await db.flush()
