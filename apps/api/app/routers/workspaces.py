"""Workspace management scoped to org."""
from app.utils.time import utc_now, utc_now_plus
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.models.tenancy import Invite, WorkspaceMembership
from app.schemas.tenancy import InviteCreate, InviteCreated, InviteRead
from app.schemas.workspaces import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate
from app.services.audit import log_audit
from app.services.authorization import generate_invite_token, require_limit, require_role_capacity
from app.services.roles import ORG_ADMIN_ROLES, effective_workspace_role
from app.services.tenancy import TenancyContext, get_org_context, get_workspace_context

router = APIRouter(prefix="/orgs/{org_slug}/workspaces", tags=["workspaces"])


def _invite_url(token: str) -> str:
    return f"/invites/{token}"


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceRead]:
    q = select(Workspace).where(Workspace.org_id == ctx.org_id).order_by(Workspace.created_at)

    if ctx.org_role not in ORG_ADMIN_ROLES:
        q = q.join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id).where(
            WorkspaceMembership.user_id == ctx.user_id
        )

    result = await db.execute(q)
    workspaces = result.scalars().all()

    reads: list[WorkspaceRead] = []
    for ws in workspaces:
        ws_role = None
        if ctx.org_role not in ORG_ADMIN_ROLES:
            mem = await db.execute(
                select(WorkspaceMembership.role).where(
                    WorkspaceMembership.user_id == ctx.user_id,
                    WorkspaceMembership.workspace_id == ws.id,
                )
            )
            ws_role = mem.scalar_one_or_none()
        reads.append(
            WorkspaceRead(
                id=ws.id,
                org_id=ws.org_id,
                slug=ws.slug,
                name=ws.name,
                template_id=ws.template_id,
                biz_layer_term=ws.biz_layer_term,
                app_layer_term=ws.app_layer_term,
                constraint_mode=ws.constraint_mode,
                role=effective_workspace_role(ctx.org_role, ws_role),
                created_at=ws.created_at,
            )
        )
    return reads


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    body: WorkspaceCreate,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceRead:
    await ctx.require_permission(db, "workspace.create")
    await require_limit(db, ctx.org_id, "max_workspaces")

    existing = await db.execute(
        select(Workspace).where(Workspace.org_id == ctx.org_id, Workspace.slug == body.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Workspace slug already taken")

    ws = Workspace(
        org_id=ctx.org_id,
        slug=body.slug,
        name=body.name,
        template_id=body.template_id,
        biz_layer_term=body.biz_layer_term,
        app_layer_term=body.app_layer_term,
        constraint_mode=body.constraint_mode,
    )
    db.add(ws)
    await db.flush()

    db.add(WorkspaceMembership(user_id=ctx.user_id, workspace_id=ws.id, role="admin"))

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="workspace.created",
        target_type="workspace",
        target_id=ws.id,
        metadata={"slug": ws.slug},
    )

    await db.commit()
    await db.refresh(ws)

    return WorkspaceRead(
        id=ws.id,
        org_id=ws.org_id,
        slug=ws.slug,
        name=ws.name,
        template_id=ws.template_id,
        biz_layer_term=ws.biz_layer_term,
        app_layer_term=ws.app_layer_term,
        constraint_mode=ws.constraint_mode,
        role="admin",
        created_at=ws.created_at,
    )


@router.get("/{workspace_slug}", response_model=WorkspaceRead)
async def get_workspace(ctx: TenancyContext = Depends(get_workspace_context)) -> WorkspaceRead:
    assert ctx.workspace
    return WorkspaceRead(
        id=ctx.workspace.id,
        org_id=ctx.workspace.org_id,
        slug=ctx.workspace.slug,
        name=ctx.workspace.name,
        template_id=ctx.workspace.template_id,
        biz_layer_term=ctx.workspace.biz_layer_term,
        app_layer_term=ctx.workspace.app_layer_term,
        constraint_mode=ctx.workspace.constraint_mode,
        role=ctx.effective_ws_role,
        created_at=ctx.workspace.created_at,
    )


@router.put("/{workspace_slug}", response_model=WorkspaceRead)
async def update_workspace(
    body: WorkspaceUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceRead:
    await ctx.require_permission(db, "workspace.settings.edit")
    assert ctx.workspace

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(ctx.workspace, field, value)

    await db.commit()
    await db.refresh(ctx.workspace)

    return WorkspaceRead(
        id=ctx.workspace.id,
        org_id=ctx.workspace.org_id,
        slug=ctx.workspace.slug,
        name=ctx.workspace.name,
        template_id=ctx.workspace.template_id,
        biz_layer_term=ctx.workspace.biz_layer_term,
        app_layer_term=ctx.workspace.app_layer_term,
        constraint_mode=ctx.workspace.constraint_mode,
        role=ctx.effective_ws_role,
        created_at=ctx.workspace.created_at,
    )


@router.delete("/{workspace_slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "workspace.delete")
    assert ctx.workspace

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="workspace.deleted",
        target_type="workspace",
        target_id=ctx.workspace.id,
        metadata={"slug": ctx.workspace.slug},
    )

    await db.delete(ctx.workspace)
    await db.commit()


@router.get("/{workspace_slug}/invites", response_model=list[InviteRead])
async def list_workspace_invites(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[InviteRead]:
    await ctx.require_permission(db, "workspace.member.invite")
    assert ctx.workspace

    result = await db.execute(
        select(Invite)
        .where(Invite.org_id == ctx.org_id, Invite.workspace_id == ctx.workspace.id)
        .order_by(Invite.created_at.desc())
    )
    return [
        InviteRead(
            id=inv.id,
            email=inv.email,
            role=inv.role,
            workspace_id=inv.workspace_id,
            status=inv.status,
            expires_at=inv.expires_at,
            consumed_at=inv.consumed_at,
            created_at=inv.created_at,
        )
        for inv in result.scalars().all()
    ]


@router.post("/{workspace_slug}/invites", response_model=InviteCreated, status_code=status.HTTP_201_CREATED)
async def create_workspace_invite(
    body: InviteCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> InviteCreated:
    await ctx.require_permission(db, "workspace.member.invite")
    assert ctx.workspace

    await require_limit(db, ctx.org_id, "max_pending_invites", pending_delta=1)
    await require_role_capacity(db, ctx.org_id, body.role)

    raw_token, token_hash = generate_invite_token()
    invite = Invite(
        token_hash=token_hash,
        org_id=ctx.org_id,
        workspace_id=ctx.workspace.id,
        email=body.email.lower().strip(),
        role=body.role,
        status="pending",
        expires_at=utc_now_plus(days=7),
        created_by=ctx.user_id,
    )
    db.add(invite)
    await db.flush()

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="invite.issued",
        target_type="invite",
        target_id=invite.id,
        metadata={
            "email": invite.email,
            "role": invite.role,
            "workspace_id": str(ctx.workspace.id),
        },
    )
    await db.commit()
    await db.refresh(invite)

    return InviteCreated(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        workspace_id=invite.workspace_id,
        status=invite.status,
        expires_at=invite.expires_at,
        invite_url=_invite_url(raw_token),
        token=raw_token,
    )


@router.delete("/{workspace_slug}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_workspace_invite(
    invite_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "workspace.member.invite")
    assert ctx.workspace

    result = await db.execute(
        select(Invite).where(
            Invite.id == invite_id,
            Invite.org_id == ctx.org_id,
            Invite.workspace_id == ctx.workspace.id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending")

    invite.status = "revoked"
    invite.revoked_at = utc_now()

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="invite.revoked",
        target_type="invite",
        target_id=invite.id,
        metadata={"email": invite.email},
    )
    await db.commit()


async def build_workspace_context_graph(ctx: TenancyContext, db: AsyncSession) -> dict:
    """Full object graph for AI prompt — scoped to workspace."""
    from app.models.objects import MinEAObject
    from app.models.relationships import Relationship

    assert ctx.workspace

    objects_result = await db.execute(
        select(MinEAObject).where(MinEAObject.workspace_id == ctx.workspace.id)
    )
    objects = objects_result.scalars().all()

    rels_result = await db.execute(
        select(Relationship).where(Relationship.workspace_id == ctx.workspace.id)
    )
    rels = rels_result.scalars().all()

    return {
        "workspace": {
            "id": str(ctx.workspace.id),
            "slug": ctx.workspace.slug,
            "name": ctx.workspace.name,
            "biz_layer_term": ctx.workspace.biz_layer_term,
            "app_layer_term": ctx.workspace.app_layer_term,
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


@router.get("/{workspace_slug}/context")
async def get_workspace_context_graph(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await ctx.require_read(db)
    return await build_workspace_context_graph(ctx, db)
