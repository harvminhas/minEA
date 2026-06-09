"""Workspace management scoped to org."""
from app.utils.time import utc_now, utc_now_plus
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.models.shares import ShareLink
from app.models.tenancy import Invite, User, WorkspaceMembership
from app.schemas.shares import ShareCreate, ShareCreated, ShareRead
from app.schemas.tenancy import InviteCreate, InviteCreated, InviteRead, WorkspaceMemberRead
from app.schemas.workspace_summary import WorkspaceSnapshotResponse
from app.schemas.workspaces import (
    WorkspaceCopyPreview,
    WorkspaceCopyPreviewLayer,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceUpdate,
)
from app.services.workspace_copy import copy_workspace_layers, get_workspace_copy_preview
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.workspace_snapshot_store import get_workspace_snapshot_response
from app.services.audit import log_audit
from app.services.authorization import (
    generate_invite_token,
    require_limit,
    require_role_capacity,
)
from app.services.share_access import validate_share_create
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
    from sqlalchemy import func

    from app.services.plan_features import assert_can_create_own_workspace

    await ctx.require_permission(db, "workspace.create")
    count_result = await db.execute(
        select(func.count()).select_from(Workspace).where(Workspace.org_id == ctx.org_id)
    )
    owned_count = count_result.scalar_one()
    assert_can_create_own_workspace(ctx.org.plan, owned_count)
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

    if body.source_workspace_slug and body.copy_layers:
        source_result = await db.execute(
            select(Workspace).where(
                Workspace.org_id == ctx.org_id,
                Workspace.slug == body.source_workspace_slug,
            )
        )
        source_ws = source_result.scalar_one_or_none()
        if not source_ws:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source workspace not found")
        if source_ws.id == ws.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot copy from the workspace being created",
            )
        await copy_workspace_layers(db, source_ws, ws, body.copy_layers, ctx.user_id)

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="workspace.created",
        target_type="workspace",
        target_id=ws.id,
        metadata={"slug": ws.slug},
    )

    await notify_workspace_data_changed(db, ws.id, ctx.org_id)
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


@router.get("/{workspace_slug}/copy-preview", response_model=WorkspaceCopyPreview)
async def get_workspace_copy_preview_endpoint(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceCopyPreview:
    """Layer item counts for the workspace copy UI."""
    await ctx.require_permission(db, "workspace.create")
    assert ctx.workspace
    layers = await get_workspace_copy_preview(db, ctx.workspace.id)
    return WorkspaceCopyPreview(
        layers=[WorkspaceCopyPreviewLayer(**layer) for layer in layers]
    )


@router.get("/{workspace_slug}/summary", response_model=WorkspaceSnapshotResponse)
async def get_workspace_summary(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceSnapshotResponse:
    """Derived workspace snapshot (JSONB). May be stale while rebuilding in background."""
    await ctx.require_read(db)
    assert ctx.workspace
    return await get_workspace_snapshot_response(db, ctx.workspace.id, ctx.org_id)


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


@router.get("/{workspace_slug}/members", response_model=list[WorkspaceMemberRead])
async def list_workspace_members(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceMemberRead]:
    await ctx.require_permission(db, "workspace.settings.edit")
    assert ctx.workspace

    result = await db.execute(
        select(User, WorkspaceMembership.role, WorkspaceMembership.created_at)
        .join(WorkspaceMembership, WorkspaceMembership.user_id == User.id)
        .where(WorkspaceMembership.workspace_id == ctx.workspace.id)
        .order_by(WorkspaceMembership.created_at)
    )
    return [
        WorkspaceMemberRead(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=role,
            joined_at=joined_at,
        )
        for user, role, joined_at in result.all()
    ]


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
    from app.services.plan_features import assert_plan_allows_invites

    await ctx.require_permission(db, "workspace.member.invite")
    assert ctx.workspace
    assert_plan_allows_invites(ctx.org.plan)

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


def _share_url(token: str) -> str:
    return f"/share/{token}"


@router.get("/{workspace_slug}/shares", response_model=list[ShareRead])
async def list_share_links(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[ShareRead]:
    await ctx.require_permission(db, "workspace.share.create")
    assert ctx.workspace

    result = await db.execute(
        select(ShareLink)
        .where(ShareLink.workspace_id == ctx.workspace.id, ShareLink.org_id == ctx.org_id)
        .order_by(ShareLink.created_at.desc())
    )
    return [
        ShareRead(
            id=link.id,
            resource_type=link.resource_type,
            resource_key=link.resource_key,
            resource_id=link.resource_id,
            title=link.title,
            status=link.status,
            expires_at=link.expires_at,
            created_at=link.created_at,
            share_url=_share_url("…"),
        )
        for link in result.scalars().all()
    ]


@router.post("/{workspace_slug}/shares", response_model=ShareCreated, status_code=status.HTTP_201_CREATED)
async def create_share_link(
    body: ShareCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ShareCreated:
    await ctx.require_permission(db, "workspace.share.create")
    assert ctx.workspace

    validate_share_create(ctx.org.plan, body.resource_type, body.resource_key)

    await require_limit(db, ctx.org_id, "max_active_share_links", pending_delta=1)

    if body.resource_type in ("roadmap", "object", "capability_domain") and not body.resource_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resource_id required")
    if body.resource_type == "view" and not body.resource_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resource_key required")

    raw_token, token_hash = generate_invite_token()
    link = ShareLink(
        token_hash=token_hash,
        org_id=ctx.org_id,
        workspace_id=ctx.workspace.id,
        resource_type=body.resource_type,
        resource_key=body.resource_key,
        resource_id=body.resource_id,
        title=body.title,
        status="active",
        expires_at=utc_now_plus(days=body.expires_in_days),
        created_by=ctx.user_id,
    )
    db.add(link)
    await db.flush()

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="share.created",
        target_type="share_link",
        target_id=link.id,
        metadata={
            "resource_type": link.resource_type,
            "resource_key": link.resource_key,
            "title": link.title,
        },
    )
    await db.commit()
    await db.refresh(link)

    return ShareCreated(
        id=link.id,
        resource_type=link.resource_type,
        resource_key=link.resource_key,
        resource_id=link.resource_id,
        title=link.title,
        status=link.status,
        expires_at=link.expires_at,
        created_at=link.created_at,
        share_url=_share_url(raw_token),
        token=raw_token,
    )


@router.delete("/{workspace_slug}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_link(
    share_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "workspace.share.create")
    assert ctx.workspace

    result = await db.execute(
        select(ShareLink).where(
            ShareLink.id == share_id,
            ShareLink.workspace_id == ctx.workspace.id,
            ShareLink.org_id == ctx.org_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")
    if link.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Share link is not active")

    link.status = "revoked"
    link.revoked_at = utc_now()

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="share.revoked",
        target_type="share_link",
        target_id=link.id,
        metadata={"title": link.title},
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
