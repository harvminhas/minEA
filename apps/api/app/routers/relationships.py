from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.relationships import Relationship
from app.schemas.relationships import RelationshipCreate, RelationshipRead

router = APIRouter(prefix="/relationships", tags=["relationships"])


@router.get("", response_model=list[RelationshipRead])
async def list_relationships(
    workspace_id: UUID = Query(...),
    from_object_id: UUID | None = Query(None),
    to_object_id: UUID | None = Query(None),
    type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> list[Relationship]:
    q = select(Relationship).where(
        Relationship.workspace_id == workspace_id,
        Relationship.org_id == UUID(auth.org_id),
    )
    if from_object_id:
        q = q.where(Relationship.from_object_id == from_object_id)
    if to_object_id:
        q = q.where(Relationship.to_object_id == to_object_id)
    if type:
        q = q.where(Relationship.type == type)

    result = await db.execute(q.order_by(Relationship.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=RelationshipRead, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    body: RelationshipCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> Relationship:
    rel = Relationship(
        workspace_id=body.workspace_id,
        org_id=UUID(auth.org_id),
        type=body.type,
        from_object_id=body.from_object_id,
        from_type=body.from_type,
        to_object_id=body.to_object_id,
        to_type=body.to_type,
        attributes=body.attributes,
    )
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return rel


@router.delete("/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    relationship_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> None:
    result = await db.execute(
        select(Relationship).where(
            Relationship.id == relationship_id,
            Relationship.org_id == UUID(auth.org_id),
        )
    )
    rel = result.scalar_one_or_none()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")
    await db.delete(rel)
    await db.commit()
