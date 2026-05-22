from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.objects import MinEAObject, Organisation, Workspace
from app.models.relationships import Relationship
from app.schemas.workspaces import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> list[Workspace]:
    result = await db.execute(
        select(Workspace).where(Workspace.org_id == UUID(auth.org_id)).order_by(Workspace.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    body: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> Workspace:
    # Ensure the org exists
    org_result = await db.execute(
        select(Organisation).where(Organisation.id == UUID(auth.org_id))
    )
    if not org_result.scalar_one_or_none():
        # Auto-create org record if it doesn't exist yet (Clerk webhook may be delayed)
        org = Organisation(id=UUID(auth.org_id), name="My Organisation", slug=auth.org_id[:8])
        db.add(org)
        await db.flush()

    ws = Workspace(
        org_id=UUID(auth.org_id),
        name=body.name,
        template_id=body.template_id,
        biz_layer_term=body.biz_layer_term,
        app_layer_term=body.app_layer_term,
        constraint_mode=body.constraint_mode,
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


@router.get("/{workspace_id}", response_model=WorkspaceRead)
async def get_workspace(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> Workspace:
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.org_id == UUID(auth.org_id))
    )
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws


@router.put("/{workspace_id}", response_model=WorkspaceRead)
async def update_workspace(
    workspace_id: UUID,
    body: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> Workspace:
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.org_id == UUID(auth.org_id))
    )
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(ws, field, value)

    await db.commit()
    await db.refresh(ws)
    return ws


@router.get("/{workspace_id}/context")
async def get_workspace_context(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    """Return the full object graph for this workspace — used as AI prompt context."""
    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.org_id == UUID(auth.org_id))
    )
    ws = ws_result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    objects_result = await db.execute(
        select(MinEAObject).where(MinEAObject.workspace_id == workspace_id)
    )
    objects = objects_result.scalars().all()

    rels_result = await db.execute(
        select(Relationship).where(Relationship.workspace_id == workspace_id)
    )
    rels = rels_result.scalars().all()

    return {
        "workspace": {
            "id": str(ws.id),
            "name": ws.name,
            "biz_layer_term": ws.biz_layer_term,
            "app_layer_term": ws.app_layer_term,
        },
        "objects": [
            {
                "id": str(o.id),
                "type": o.type,
                "name": o.name,
                "description": o.description,
                "status": o.status,
                "owner": o.owner,
                "properties": o.properties,
                "tags": o.tags,
            }
            for o in objects
        ],
        "relationships": [
            {
                "id": str(r.id),
                "type": r.type,
                "from": str(r.from_object_id),
                "from_type": r.from_type,
                "to": str(r.to_object_id),
                "to_type": r.to_type,
                "attributes": r.attributes,
            }
            for r in rels
        ],
    }
