"""Invite acceptance flow."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.objects import Workspace
from app.models.tenancy import Invite, Org, OrgMembership, User, WorkspaceMembership
from app.schemas.tenancy import InvitePreview
from app.services.audit import log_audit
from app.services.authorization import hash_token, invite_is_active, require_role_capacity
from app.services.tenancy import _resolve_user, _set_rls_org, enroll_org_member_in_workspaces
from app.utils.time import as_utc_naive, utc_now

router = APIRouter(prefix="/invites", tags=["invites"])


async def _resolve_invite(db: AsyncSession, token: str) -> tuple[Invite, Org, Workspace | None]:
    token_hash = hash_token(token)
    result = await db.execute(
        select(Invite, Org, Workspace)
        .join(Org, Org.id == Invite.org_id)
        .outerjoin(Workspace, Workspace.id == Invite.workspace_id)
        .where(Invite.token_hash == token_hash)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    return row


@router.get("/{token}", response_model=InvitePreview)
async def preview_invite(token: str, db: AsyncSession = Depends(get_db)) -> InvitePreview:
    invite, org, workspace = await _resolve_invite(db, token)
    expired = invite.status == "expired" or (
        invite.status == "pending" and as_utc_naive(invite.expires_at) < utc_now()
    )
    return InvitePreview(
        org_name=org.name,
        org_slug=org.slug,
        email=invite.email,
        role=invite.role,
        workspace_slug=workspace.slug if workspace else None,
        status=invite.status,
        expired=expired,
        consumed=invite.status == "accepted",
    )


@router.post("/{token}/accept")
async def accept_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    user = await _resolve_user(db, auth, create_if_missing=True)
    invite, org, workspace = await _resolve_invite(db, token)

    now = utc_now()

    if invite.status == "accepted":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite already used")
    if invite.status == "revoked":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite revoked")
    if invite.status == "expired" or not invite_is_active(invite):
        if invite.status == "pending":
            invite.status = "expired"
            await log_audit(
                db,
                org_id=invite.org_id,
                actor_user_id=None,
                action="invite.expired",
                target_type="invite",
                target_id=invite.id,
                metadata={"email": invite.email},
            )
            await db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite expired")

    if user.email.lower() != invite.email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invite email does not match your account")

    await _set_rls_org(db, invite.org_id)

    existing = await db.execute(
        select(OrgMembership).where(
            OrgMembership.user_id == user.id,
            OrgMembership.org_id == invite.org_id,
        )
    )
    org_membership = existing.scalar_one_or_none()

    if workspace:
        # Workspace-scoped invite: ensure org membership, then workspace membership
        if not org_membership:
            await require_role_capacity(db, invite.org_id, "member")
            org_membership = OrgMembership(user_id=user.id, org_id=invite.org_id, role="member")
            db.add(org_membership)
            await db.flush()
            await log_audit(
                db,
                org_id=invite.org_id,
                actor_user_id=user.id,
                action="member.added",
                target_type="user",
                target_id=user.id,
                metadata={"role": "member", "via": "workspace_invite"},
            )

        ws_mem = await db.execute(
            select(WorkspaceMembership).where(
                WorkspaceMembership.user_id == user.id,
                WorkspaceMembership.workspace_id == workspace.id,
            )
        )
        if ws_mem.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this workspace")

        await require_role_capacity(db, invite.org_id, invite.role)
        db.add(
            WorkspaceMembership(
                user_id=user.id,
                workspace_id=workspace.id,
                role=invite.role,
            )
        )
        assigned_role = invite.role
        redirect_workspace = workspace.slug
    else:
        if org_membership:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this org")

        await require_role_capacity(db, invite.org_id, invite.role)
        db.add(OrgMembership(user_id=user.id, org_id=invite.org_id, role=invite.role))
        await db.flush()
        assigned_role = invite.role
        redirect_workspace = await enroll_org_member_in_workspaces(
            db, org_id=invite.org_id, user_id=user.id, org_role=invite.role
        )
        # Org-level invites do not auto-join workspaces — assign per-workspace roles via workspace invites.

    invite.status = "accepted"
    invite.consumed_at = now

    await log_audit(
        db,
        org_id=invite.org_id,
        actor_user_id=user.id,
        action="invite.accepted",
        target_type="invite",
        target_id=invite.id,
        metadata={"email": invite.email, "role": assigned_role},
    )
    await log_audit(
        db,
        org_id=invite.org_id,
        actor_user_id=user.id,
        action="member.added",
        target_type="user",
        target_id=user.id,
        metadata={"role": assigned_role, "via": "invite"},
    )

    await db.commit()

    response: dict = {"org_slug": org.slug, "role": assigned_role}
    if redirect_workspace:
        response["workspace_slug"] = redirect_workspace
    return response
