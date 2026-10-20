"""Invite people (one invite per person), the merged People list, and workspace access edits.

Org owners/admins manage everything. A workspace admin can invite new people, resend, copy and
revoke their invites, and set people's access, but only for workspaces they admin.
"""

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.models.tenancy import Invite, OrgMembership, User, WorkspaceMembership
from app.schemas.tenancy import (
    InviteCreate,
    InviteCreated,
    InviteIssued,
    InviteLink,
    InvitesCreated,
    ManageableWorkspace,
    MemberWorkspacesSet,
    PendingAccess,
    PeopleResponse,
    PersonRow,
)
from app.services.audit import log_audit
from app.services.authorization import require_role_capacity
from app.services.invitations import (
    INVITE_DAYS,
    can_invite_org_admins,
    current_token,
    describe_workspaces,
    invite_absolute_url,
    invite_grants,
    invite_is_pending,
    invite_path,
    issue_invites,
    issue_link,
    manageable_workspaces,
    require_can_manage_invite,
)
from app.services.invite_email import send_invite_email
from app.services.licences import EDITOR_WORKSPACE_ROLES, require_licence
from app.services.member_guardrails import GuardrailError, check_ws_removal, check_ws_role_change
from app.services.roles import ORG_ADMIN_ROLES
from app.services.tenancy import TenancyContext, get_org_context
from app.utils.time import utc_now, utc_now_plus

router = APIRouter(prefix="/orgs", tags=["invites"])


def _inviter(ctx: TenancyContext) -> str:
    return (ctx.user.full_name or "").strip() or ctx.user.email


async def email_invite(db: AsyncSession, ctx: TenancyContext, invite: Invite, token: str, workspaces: list[dict], org_admin: bool) -> bool:
    """Send after the invite is saved; a failure only means the admin copies the link."""
    sent = await asyncio.to_thread(
        send_invite_email,
        to=invite.email,
        org_name=ctx.org.name,
        inviter=_inviter(ctx),
        workspaces=workspaces,
        org_admin=org_admin,
        url=invite_absolute_url(token),
        reply_to=ctx.user.email,
    )
    if sent:
        invite.email_sent_at = utc_now()
        await db.commit()
    return sent


def _legacy_shape(body: InviteCreate) -> tuple[list[str], list[tuple[str, str]], bool]:
    emails = list(body.emails)
    workspaces = [(w.slug, w.role) for w in body.workspaces]
    org_admin = body.org_admin
    if body.email:
        emails.append(body.email)
        if body.workspace_slug:
            workspaces.append((body.workspace_slug, body.role or "member"))
        elif body.role == "admin":
            org_admin = True
    return emails, workspaces, org_admin


async def create_invites(db: AsyncSession, ctx: TenancyContext, emails: list[str], workspaces: list[tuple[str, str]], org_admin: bool) -> InvitesCreated:
    issued = await issue_invites(db, ctx, emails=emails, workspaces=workspaces, org_admin=org_admin)
    described = []
    for item in issued:
        access = await describe_workspaces(db, item.grants)
        described.append(access)
        await log_audit(
            db,
            org_id=ctx.org_id,
            actor_user_id=ctx.user_id,
            action="invite.updated" if item.merged else "invite.issued",
            target_type="invite",
            target_id=item.invite.id,
            metadata={
                "email": item.invite.email,
                "org_role": item.grants.org_role,
                "workspaces": {a["slug"]: a["role"] for a in access},
            },
        )
    await db.commit()
    out: list[InviteIssued] = []
    for item, access in zip(issued, described):
        sent = await email_invite(db, ctx, item.invite, item.token, access, item.grants.org_role == "admin")
        out.append(
            InviteIssued(
                id=item.invite.id,
                email=item.invite.email,
                invite_url=invite_path(item.token),
                email_sent=sent,
                merged=item.merged,
                expires_at=item.invite.expires_at,
                org_admin=item.grants.org_role == "admin",
                workspaces=access,
            )
        )
    return InvitesCreated(invites=out, invite_url=out[0].invite_url if out else None)


@router.post("/{org_slug}/invites", response_model=InvitesCreated, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreate,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> InvitesCreated:
    emails, workspaces, org_admin = _legacy_shape(body)
    return await create_invites(db, ctx, emails, workspaces, org_admin)


async def _invite(db: AsyncSession, ctx: TenancyContext, invite_id: uuid.UUID) -> Invite:
    invite = (
        await db.execute(select(Invite).where(Invite.id == invite_id, Invite.org_id == ctx.org_id))
    ).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    return invite


@router.post("/{org_slug}/invites/{invite_id}/resend", response_model=InviteCreated)
async def resend_invite(
    invite_id: uuid.UUID,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> InviteCreated:
    """Email the invite again with a fresh link (the old link stops working), valid 7 more days."""
    invite = await _invite(db, ctx, invite_id)
    grants = await require_can_manage_invite(db, ctx, invite)
    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending")
    token = issue_link(invite)
    invite.expires_at = utc_now_plus(days=INVITE_DAYS)
    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="invite.resent",
        target_type="invite",
        target_id=invite.id,
        metadata={"email": invite.email},
    )
    await db.commit()
    await db.refresh(invite)
    access = await describe_workspaces(db, grants)
    sent = await email_invite(db, ctx, invite, token, access, grants.org_role == "admin")
    return InviteCreated(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        workspace_id=invite.workspace_id,
        status=invite.status,
        expires_at=invite.expires_at,
        invite_url=invite_path(token),
        token=token,
        email_sent=sent,
    )


@router.get("/{org_slug}/invites/{invite_id}/link", response_model=InviteLink)
async def copy_invite_link(
    invite_id: uuid.UUID,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> InviteLink:
    """The link the person was sent (same link, still valid). 409 when it can't be rebuilt."""
    invite = await _invite(db, ctx, invite_id)
    await require_can_manage_invite(db, ctx, invite)
    if not invite_is_pending(invite):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending")
    token = current_token(invite)
    if not token:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This link can't be copied again. Use Resend invite for a new one.")
    return InviteLink(invite_url=invite_path(token))


@router.delete("/{org_slug}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: uuid.UUID,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    invite = await _invite(db, ctx, invite_id)
    await require_can_manage_invite(db, ctx, invite)
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


@router.get("/{org_slug}/people", response_model=PeopleResponse)
async def list_people(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleResponse:
    """One row per person: members with their workspace access, and pending invites (merged into the
    member's row when they're already in the org). Workspace admins see their workspaces only."""
    is_org_admin = await can_invite_org_admins(db, ctx)
    manageable = await manageable_workspaces(db, ctx)
    if not is_org_admin and not manageable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: org.member.invite")
    visible = {ws.id: ws for ws in manageable}

    rows: dict[str, PersonRow] = {}
    members = (
        await db.execute(
            select(User, OrgMembership.role)
            .join(OrgMembership, OrgMembership.user_id == User.id)
            .where(OrgMembership.org_id == ctx.org_id)
            .order_by(OrgMembership.created_at)
        )
    ).all()
    ws_rows = (
        await db.execute(
            select(WorkspaceMembership.user_id, WorkspaceMembership.workspace_id, WorkspaceMembership.role).where(
                WorkspaceMembership.workspace_id.in_(list(visible) or [uuid.uuid4()])
            )
        )
    ).all()
    access_by_user: dict[uuid.UUID, list] = {}
    order = {ws_id: i for i, ws_id in enumerate(visible)}
    for user_id, ws_id, role in sorted(ws_rows, key=lambda r: order.get(r[1], 0)):
        ws = visible[ws_id]
        access_by_user.setdefault(user_id, []).append({"slug": ws.slug, "name": ws.name, "role": role})
    for user, role in members:
        access = access_by_user.get(user.id, [])
        if not is_org_admin and not access:
            continue  # workspace admins see people in their workspaces
        rows[user.email.lower()] = PersonRow(
            email=user.email, user_id=user.id, full_name=user.full_name, org_role=role, workspaces=access
        )

    invites = (
        await db.execute(
            select(Invite).where(Invite.org_id == ctx.org_id, Invite.status == "pending").order_by(Invite.created_at.desc())
        )
    ).scalars().all()
    for invite in invites:
        if not invite_is_pending(invite):
            continue
        grants = await invite_grants(db, invite)
        access = await describe_workspaces(db, grants)
        mine = [a for a in access if any(ws.slug == a["slug"] for ws in manageable)]
        manage = is_org_admin or (grants.org_role != "admin" and len(mine) == len(access) and bool(access))
        if not is_org_admin and not mine:
            continue
        pending = PendingAccess(
            id=invite.id,
            org_admin=grants.org_role == "admin",
            workspaces=access if is_org_admin else mine,
            expires_at=invite.expires_at,
            email_sent_at=invite.email_sent_at,
            can_copy=manage and current_token(invite) is not None,
            can_manage=manage,
        )
        key = invite.email.lower()
        if key in rows:
            if rows[key].invite is None:
                rows[key].invite = pending
        else:
            rows[key] = PersonRow(email=invite.email, invite=pending)

    return PeopleResponse(
        people=list(rows.values()),
        workspaces=[ManageableWorkspace(slug=ws.slug, name=ws.name) for ws in manageable],
        can_invite_org_admins=is_org_admin,
    )


def _guard(fn, **kwargs) -> None:
    try:
        fn(**kwargs)
    except GuardrailError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e


@router.put("/{org_slug}/members/{user_id}/workspaces", response_model=PersonRow)
async def set_member_workspaces(
    user_id: uuid.UUID,
    body: MemberWorkspacesSet,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> PersonRow:
    """Set someone's access to the workspaces the actor manages (others are left alone): adds,
    changes and removes workspace memberships. Same rules as the workspace Members page."""
    manageable = await manageable_workspaces(db, ctx)
    if not manageable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: workspace.member.invite")
    row = (
        await db.execute(
            select(User, OrgMembership.role)
            .join(OrgMembership, OrgMembership.user_id == User.id)
            .where(OrgMembership.org_id == ctx.org_id, OrgMembership.user_id == user_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    user, org_role = row
    by_slug = {ws.slug: ws for ws in manageable}
    wanted: dict[uuid.UUID, str] = {}
    for item in body.workspaces:
        ws = by_slug.get(item.slug)
        if not ws:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"You can't change access to {item.slug}")
        wanted[ws.id] = item.role

    current = {
        m.workspace_id: m
        for m in (
            await db.execute(
                select(WorkspaceMembership).where(
                    WorkspaceMembership.user_id == user_id,
                    WorkspaceMembership.workspace_id.in_(list(by_slug[s].id for s in by_slug)),
                )
            )
        ).scalars()
    }

    async def admin_count(ws_id: uuid.UUID) -> int:
        return len(
            (
                await db.execute(
                    select(WorkspaceMembership.user_id).where(
                        WorkspaceMembership.workspace_id == ws_id, WorkspaceMembership.role == "admin"
                    )
                )
            ).all()
        )

    licence_needed = False
    for ws in manageable:
        have = current.get(ws.id)
        want = wanted.get(ws.id)
        if have and want is None:
            _guard(check_ws_removal, is_self=user_id == ctx.user_id, target_role=have.role, admin_count=await admin_count(ws.id))
            await db.delete(have)
            await log_audit(db, org_id=ctx.org_id, actor_user_id=ctx.user_id, action="workspace_member.removed", target_type="user", target_id=user_id, metadata={"role": have.role, "workspace_id": str(ws.id)})
        elif have and want and want != have.role:
            _guard(check_ws_role_change, target_role=have.role, new_role=want, admin_count=await admin_count(ws.id))
            await require_role_capacity(db, ctx.org_id, want)
            licence_needed = licence_needed or want in EDITOR_WORKSPACE_ROLES
            await log_audit(db, org_id=ctx.org_id, actor_user_id=ctx.user_id, action="workspace_member.role_changed", target_type="user", target_id=user_id, metadata={"from": have.role, "to": want, "workspace_id": str(ws.id)})
            have.role = want
        elif want and not have:
            await require_role_capacity(db, ctx.org_id, want)
            licence_needed = licence_needed or want in EDITOR_WORKSPACE_ROLES
            db.add(WorkspaceMembership(user_id=user_id, workspace_id=ws.id, role=want))
            await log_audit(db, org_id=ctx.org_id, actor_user_id=ctx.user_id, action="workspace_member.added", target_type="user", target_id=user_id, metadata={"role": want, "workspace_id": str(ws.id)})
    if licence_needed and org_role not in ORG_ADMIN_ROLES:
        await require_licence(db, ctx.org_id, user_id=user_id, email=user.email)
    await db.commit()

    access_rows = (
        await db.execute(
            select(Workspace, WorkspaceMembership.role)
            .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
            .where(WorkspaceMembership.user_id == user_id, Workspace.id.in_([ws.id for ws in manageable]))
            .order_by(Workspace.created_at)
        )
    ).all()
    return PersonRow(
        email=user.email,
        user_id=user.id,
        full_name=user.full_name,
        org_role=org_role,
        workspaces=[{"slug": ws.slug, "name": ws.name, "role": role} for ws, role in access_rows],
    )
