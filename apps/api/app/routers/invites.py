"""Invite preview and acceptance (one invite per person; links sent before 055 still work)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.objects import Workspace
from app.models.tenancy import Invite, Org, User
from app.schemas.tenancy import InvitePreview
from app.services.audit import log_audit
from app.services.authorization import hash_token, invite_is_active
from app.services.invitations import accept, describe_workspaces, invite_grants
from app.services.tenancy import _resolve_user, _set_rls_org
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
    grants = await invite_grants(db, invite)
    inviter = None
    if invite.created_by:
        user = (await db.execute(select(User).where(User.id == invite.created_by))).scalar_one_or_none()
        if user:
            inviter = (user.full_name or "").strip() or user.email
    return InvitePreview(
        org_name=org.name,
        org_slug=org.slug,
        email=invite.email,
        role=invite.role,
        workspace_slug=workspace.slug if workspace else None,
        status=invite.status,
        expired=expired,
        consumed=invite.status == "accepted",
        workspaces=await describe_workspaces(db, grants),
        org_admin=grants.org_role == "admin",
        inviter=inviter,
    )


@router.post("/{token}/accept")
async def accept_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    """Idempotent: adds what's missing, never lowers a role, closes the person's other pending
    invites in the org. Opening a used link again (as the same person) returns already=true."""
    user = await _resolve_user(db, auth, create_if_missing=True)
    invite, org, _workspace = await _resolve_invite(db, token)

    if invite.status == "revoked":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite revoked")
    if invite.status != "accepted" and (invite.status == "expired" or not invite_is_active(invite)):
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
    was_accepted = invite.status == "accepted"
    result = await accept(db, user, invite, org)

    if not was_accepted:
        await log_audit(
            db,
            org_id=invite.org_id,
            actor_user_id=user.id,
            action="invite.accepted",
            target_type="invite",
            target_id=invite.id,
            metadata={"email": invite.email, "role": result.org_role, "already": result.already},
        )
        if not result.already:
            await log_audit(
                db,
                org_id=invite.org_id,
                actor_user_id=user.id,
                action="member.added",
                target_type="user",
                target_id=user.id,
                metadata={"role": result.org_role, "via": "invite"},
            )
        await db.commit()

    response: dict = {"org_slug": result.org_slug, "role": result.org_role, "already": result.already}
    if result.workspace_slug:
        response["workspace_slug"] = result.workspace_slug
    return response
