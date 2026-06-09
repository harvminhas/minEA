"""Org lifecycle, membership, and onboarding."""
import uuid
from app.utils.time import utc_now, utc_now_plus

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.objects import Workspace
from app.models.tenancy import Invite, Org, OrgMembership, User, WorkspaceMembership
from app.schemas.tenancy import (
    InviteCreate,
    InviteCreated,
    InviteRead,
    OrgCreate,
    OrgMemberRead,
    OrgRead,
    OwnerTransfer,
)
from app.services.audit import log_audit
from app.services.authorization import (
    generate_invite_token,
    require_limit,
    require_role_capacity,
    seed_org_limits,
)
from app.services.roles import ORG_OWNER
from app.services.tenancy import TenancyContext, get_org_context, _resolve_user, _set_rls_org

router = APIRouter(prefix="/orgs", tags=["orgs"])


class RoleChange(BaseModel):
    role: str = Field(..., pattern=r"^(admin|member)$")


def _invite_url(token: str) -> str:
    return f"/invites/{token}"


@router.get("", response_model=list[OrgRead])
async def list_my_orgs(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> list[OrgRead]:
    user = await _resolve_user(db, auth, create_if_missing=True)
    result = await db.execute(
        select(Org, OrgMembership.role)
        .join(OrgMembership, OrgMembership.org_id == Org.id)
        .where(OrgMembership.user_id == user.id)
        .order_by(Org.created_at)
    )
    return [
        OrgRead(
            id=org.id,
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            role=role,
            created_at=org.created_at,
        )
        for org, role in result.all()
    ]


@router.post("", response_model=OrgRead, status_code=status.HTTP_201_CREATED)
async def create_org(
    body: OrgCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> OrgRead:
    """Public signup: user creates org and becomes Owner."""
    user = await _resolve_user(db, auth, create_if_missing=True)

    existing = await db.execute(select(Org).where(Org.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Org slug already taken")

    org = Org(name=body.name, slug=body.slug, plan="free")
    db.add(org)
    await db.flush()

    await seed_org_limits(db, org.id, plan="free")
    db.add(OrgMembership(user_id=user.id, org_id=org.id, role=ORG_OWNER))

    ws_slug = body.workspace_slug
    ws_check = await db.execute(
        select(Workspace).where(Workspace.org_id == org.id, Workspace.slug == ws_slug)
    )
    if ws_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Workspace slug already taken in org")

    workspace = Workspace(
        org_id=org.id,
        slug=ws_slug,
        name=body.workspace_name,
        template_id="starter",
    )
    db.add(workspace)
    await db.flush()

    db.add(WorkspaceMembership(user_id=user.id, workspace_id=workspace.id, role="admin"))

    await _set_rls_org(db, org.id)
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=user.id,
        action="org.created",
        target_type="org",
        target_id=org.id,
        metadata={"slug": org.slug},
    )
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=user.id,
        action="workspace.created",
        target_type="workspace",
        target_id=workspace.id,
        metadata={"slug": workspace.slug},
    )
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=user.id,
        action="member.added",
        target_type="user",
        target_id=user.id,
        metadata={"role": ORG_OWNER},
    )

    await db.commit()
    await db.refresh(org)

    return OrgRead(
        id=org.id,
        name=org.name,
        slug=org.slug,
        plan=org.plan,
        role=ORG_OWNER,
        created_at=org.created_at,
    )


@router.get("/{org_slug}", response_model=OrgRead)
async def get_org(ctx: TenancyContext = Depends(get_org_context)) -> OrgRead:
    return OrgRead(
        id=ctx.org.id,
        name=ctx.org.name,
        slug=ctx.org.slug,
        plan=ctx.org.plan,
        role=ctx.org_role,
        created_at=ctx.org.created_at,
    )


@router.delete("/{org_slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Owner-only: permanently delete the org and all workspaces."""
    await ctx.require_permission(db, "org.delete")

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="org.deleted",
        target_type="org",
        target_id=ctx.org_id,
        metadata={"slug": ctx.org.slug},
    )
    await db.delete(ctx.org)
    await db.commit()


@router.get("/{org_slug}/members", response_model=list[OrgMemberRead])
async def list_members(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[OrgMemberRead]:
    await ctx.require_permission(db, "org.settings.edit")

    result = await db.execute(
        select(User, OrgMembership.role, OrgMembership.created_at)
        .join(OrgMembership, OrgMembership.user_id == User.id)
        .where(OrgMembership.org_id == ctx.org_id)
        .order_by(OrgMembership.created_at)
    )
    return [
        OrgMemberRead(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=role,
            joined_at=joined_at,
        )
        for user, role, joined_at in result.all()
    ]


@router.get("/{org_slug}/invites", response_model=list[InviteRead])
async def list_invites(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[InviteRead]:
    await ctx.require_permission(db, "org.member.invite")

    result = await db.execute(
        select(Invite)
        .where(Invite.org_id == ctx.org_id, Invite.workspace_id.is_(None))
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


@router.post("/{org_slug}/invites", response_model=InviteCreated, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreate,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> InviteCreated:
    from app.services.plan_features import assert_plan_allows_invites

    await ctx.require_permission(db, "org.member.invite")
    assert_plan_allows_invites(ctx.org.plan)
    await require_limit(db, ctx.org_id, "max_pending_invites", pending_delta=1)
    await require_role_capacity(db, ctx.org_id, body.role)

    if not body.workspace_slug and body.role not in ("admin", "member"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Org-level invites support admin or member roles only",
        )

    if body.workspace_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use workspace invite endpoint for workspace-scoped invites",
        )

    raw_token, token_hash = generate_invite_token()
    invite = Invite(
        token_hash=token_hash,
        org_id=ctx.org_id,
        workspace_id=None,
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
        metadata={"email": invite.email, "role": invite.role},
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


@router.delete("/{org_slug}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: uuid.UUID,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "org.member.invite")

    result = await db.execute(
        select(Invite).where(Invite.id == invite_id, Invite.org_id == ctx.org_id)
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


@router.patch("/{org_slug}/members/{user_id}/role")
async def change_member_role(
    user_id: uuid.UUID,
    body: RoleChange,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> OrgMemberRead:
    await ctx.require_permission(db, "org.role.assign")

    result = await db.execute(
        select(OrgMembership, User)
        .join(User, User.id == OrgMembership.user_id)
        .where(OrgMembership.org_id == ctx.org_id, OrgMembership.user_id == user_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    membership, user = row
    if membership.role == ORG_OWNER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use transfer ownership to change owner")

    if body.role != membership.role:
        await require_role_capacity(db, ctx.org_id, body.role)

    old_role = membership.role
    membership.role = body.role

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="member.role_changed",
        target_type="user",
        target_id=user_id,
        metadata={"from": old_role, "to": body.role},
    )
    await db.commit()

    return OrgMemberRead(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role,
        joined_at=membership.created_at,
    )


@router.post("/{org_slug}/transfer-ownership")
async def transfer_ownership(
    body: OwnerTransfer,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await ctx.require_permission(db, "org.transfer")

    if body.new_owner_user_id == ctx.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already the owner")

    owner_result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == ctx.org_id,
            OrgMembership.user_id == ctx.user_id,
            OrgMembership.role == ORG_OWNER,
        )
    )
    if not owner_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can transfer ownership")

    target_result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == ctx.org_id,
            OrgMembership.user_id == body.new_owner_user_id,
        )
    )
    target_membership = target_result.scalar_one_or_none()
    if not target_membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user is not an org member")

    old_owner_id = ctx.user_id
    target_membership.role = ORG_OWNER

    owner_membership = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == ctx.org_id,
            OrgMembership.user_id == ctx.user_id,
        )
    )
    current_owner = owner_membership.scalar_one()
    current_owner.role = "admin"

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="owner.transferred",
        target_type="user",
        target_id=body.new_owner_user_id,
        metadata={"from_user_id": str(old_owner_id), "to_user_id": str(body.new_owner_user_id)},
    )
    await db.commit()

    return {"new_owner_user_id": str(body.new_owner_user_id)}


@router.delete("/{org_slug}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: uuid.UUID,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "org.member.remove")

    result = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == ctx.org_id,
            OrgMembership.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == ORG_OWNER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove org owner")

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="member.removed",
        target_type="user",
        target_id=user_id,
        metadata={"role": membership.role},
    )

    ws_mem_result = await db.execute(
        select(WorkspaceMembership)
        .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
        .where(WorkspaceMembership.user_id == user_id, Workspace.org_id == ctx.org_id)
    )
    for ws_mem in ws_mem_result.scalars().all():
        await db.delete(ws_mem)

    await db.delete(membership)
    await db.commit()
