"""One invite per person: org access plus chosen workspaces (each with a role), accepted once.

Invite shapes (all in the invites table):
- 055 and later: workspace_id NULL, org_role 'admin' | 'member', workspaces in invite_workspaces.
  invites.role is the highest role on the invite (so pending-by-role counts keep working).
- Older workspace invite: workspace_id set, role = the workspace role.
- Older org invite: workspace_id NULL, org_role NULL, role = the org role ('admin' | 'member').
Every shape reads through invite_grants(), so links sent before 055 keep working.

Accepting is idempotent: it adds what's missing (org membership, workspace memberships), raises
roles that are lower than the invite's and never lowers one, closes every other pending invite for
that email in the org (their grants are included), and checks licences and role limits once.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass, field

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.objects import Workspace
from app.models.tenancy import Invite, InviteWorkspace, Org, OrgMembership, User, WorkspaceMembership
from app.services.authorization import AuthScope, can, hash_token, require_limit, require_role_capacity
from app.services.licences import EDITOR_ORG_ROLES, EDITOR_WORKSPACE_ROLES, require_licence, require_licences_for_emails
from app.services.roles import ORG_ADMIN_ROLES
from app.utils.time import as_utc_naive, utc_now, utc_now_plus

ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2}
ORG_RANK = {"member": 0, "admin": 1, "owner": 2}
INVITE_DAYS = 7


def higher(a: str | None, b: str | None) -> str | None:
    if a is None:
        return b
    if b is None:
        return a
    return a if ROLE_RANK.get(a, -1) >= ROLE_RANK.get(b, -1) else b


# ── Links ─────────────────────────────────────────────────────────────────────


def _link_secret() -> str | None:
    value = settings.app_secret.strip() or settings.resend_api_key.strip()
    return value or None


def token_for(invite_id: uuid.UUID, nonce: str) -> str | None:
    secret = _link_secret()
    if not secret:
        return None
    digest = hmac.new(secret.encode(), f"invite:{invite_id}:{nonce}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def issue_link(invite: Invite) -> str:
    """New token for the invite (any older link stops working). Derived from a stored nonce when a
    secret is configured, so the same link can be copied again later; random otherwise."""
    nonce = secrets.token_urlsafe(16)
    token = token_for(invite.id, nonce)
    if token:
        invite.link_nonce = nonce
    else:
        token = secrets.token_urlsafe(32)
        invite.link_nonce = None
    invite.token_hash = hash_token(token)
    return token


def current_token(invite: Invite) -> str | None:
    """The link the person was sent, if it can be rebuilt (None: Resend gives a new one)."""
    if not invite.link_nonce:
        return None
    token = token_for(invite.id, invite.link_nonce)
    if token and hash_token(token) == invite.token_hash:
        return token
    return None


def invite_path(token: str) -> str:
    return f"/invites/{token}"


def invite_absolute_url(token: str) -> str:
    return settings.web_app_url.rstrip("/") + invite_path(token)


# ── What an invite gives ──────────────────────────────────────────────────────


@dataclass
class Grants:
    org_role: str = "member"  # admin | member
    workspaces: dict[uuid.UUID, str] = field(default_factory=dict)  # workspace_id -> role
    order: list[uuid.UUID] = field(default_factory=list)

    def add_workspace(self, workspace_id: uuid.UUID, role: str) -> None:
        if workspace_id not in self.workspaces:
            self.order.append(workspace_id)
        self.workspaces[workspace_id] = higher(self.workspaces.get(workspace_id), role) or role

    def merge(self, other: "Grants") -> None:
        if other.org_role == "admin":
            self.org_role = "admin"
        for ws_id in other.order:
            self.add_workspace(ws_id, other.workspaces[ws_id])

    @property
    def top_role(self) -> str:
        if self.org_role == "admin":
            return "admin"
        roles = list(self.workspaces.values())
        return max(roles, key=lambda r: ROLE_RANK[r]) if roles else "member"

    @property
    def grants_licence(self) -> bool:
        return self.org_role in EDITOR_ORG_ROLES or any(r in EDITOR_WORKSPACE_ROLES for r in self.workspaces.values())


async def invite_grants(db: AsyncSession, invite: Invite) -> Grants:
    grants = Grants()
    if invite.workspace_id is not None:  # pre-055 workspace invite
        grants.add_workspace(invite.workspace_id, invite.role)
        return grants
    if invite.org_role is None:  # pre-055 org invite
        grants.org_role = "admin" if invite.role == "admin" else "member"
        return grants
    grants.org_role = invite.org_role
    rows = await db.execute(
        select(InviteWorkspace.workspace_id, InviteWorkspace.role)
        .where(InviteWorkspace.invite_id == invite.id)
        .order_by(InviteWorkspace.position)
    )
    for ws_id, role in rows.all():
        grants.add_workspace(ws_id, role)
    return grants


async def write_grants(db: AsyncSession, invite: Invite, grants: Grants) -> None:
    """Store grants in the 055 shape (converting an older invite row in place)."""
    invite.workspace_id = None
    invite.org_role = grants.org_role
    invite.role = grants.top_role
    existing = {
        row.workspace_id: row
        for row in (await db.execute(select(InviteWorkspace).where(InviteWorkspace.invite_id == invite.id))).scalars()
    }
    for position, ws_id in enumerate(grants.order):
        row = existing.get(ws_id)
        if row:
            row.role = grants.workspaces[ws_id]
            row.position = position
        else:
            db.add(InviteWorkspace(invite_id=invite.id, workspace_id=ws_id, role=grants.workspaces[ws_id], position=position))


def invite_is_pending(invite: Invite) -> bool:
    return invite.status == "pending" and as_utc_naive(invite.expires_at) > utc_now()


async def pending_invites_for(db: AsyncSession, org_id: uuid.UUID, email: str) -> list[Invite]:
    rows = await db.execute(
        select(Invite)
        .where(Invite.org_id == org_id, Invite.email == email.lower().strip(), Invite.status == "pending")
        .order_by(Invite.created_at)
    )
    return [inv for inv in rows.scalars().all() if invite_is_pending(inv)]


# ── Who may invite to what ────────────────────────────────────────────────────


async def manageable_workspaces(db: AsyncSession, ctx) -> list[Workspace]:
    """Workspaces the actor may invite to: all for org owners/admins, else those they admin."""
    all_ws = (
        await db.execute(select(Workspace).where(Workspace.org_id == ctx.org_id).order_by(Workspace.created_at))
    ).scalars().all()
    if ctx.org_role in ORG_ADMIN_ROLES:
        if not await can(db, ctx.to_scope(), "org.member.invite"):
            return []
        return list(all_ws)
    roles = dict(
        (
            await db.execute(
                select(WorkspaceMembership.workspace_id, WorkspaceMembership.role).where(
                    WorkspaceMembership.user_id == ctx.user_id,
                    WorkspaceMembership.workspace_id.in_([w.id for w in all_ws] or [uuid.uuid4()]),
                )
            )
        ).all()
    )
    allowed = []
    for ws in all_ws:
        role = roles.get(ws.id)
        if not role:
            continue
        scope = AuthScope(
            org_id=ctx.org_id, org_role=ctx.org_role, workspace_id=ws.id, workspace_role=role, email_verified=ctx.email_verified
        )
        if await can(db, scope, "workspace.member.invite"):
            allowed.append(ws)
    return allowed


async def can_invite_org_admins(db: AsyncSession, ctx) -> bool:
    return ctx.org_role in ORG_ADMIN_ROLES and await can(db, ctx.to_scope(), "org.member.invite")


async def require_can_manage_invite(db: AsyncSession, ctx, invite: Invite) -> Grants:
    """Org admins manage every invite; a workspace admin manages one that only touches their workspaces."""
    grants = await invite_grants(db, invite)
    if await can_invite_org_admins(db, ctx):
        return grants
    allowed = {ws.id for ws in await manageable_workspaces(db, ctx)}
    if grants.org_role == "admin" or not grants.workspaces or not set(grants.workspaces) <= allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an org admin can change this invite")
    return grants


# ── Create (or merge into the person's pending invite) ────────────────────────


@dataclass
class IssuedInvite:
    invite: Invite
    token: str
    merged: bool
    grants: Grants


def normalize_emails(raw: list[str]) -> list[str]:
    seen: list[str] = []
    for item in raw:
        for part in item.replace(";", ",").replace("\n", ",").split(","):
            email = part.strip().lower()
            if not email:
                continue
            if "@" not in email or email.startswith("@") or email.endswith("@") or " " in email:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Not an email address: {part.strip()}")
            if email not in seen:
                seen.append(email)
    if not seen:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add at least one email")
    if len(seen) > 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite up to 50 people at a time")
    return seen


async def issue_invites(
    db: AsyncSession,
    ctx,
    *,
    emails: list[str],
    workspaces: list[tuple[str, str]],
    org_admin: bool,
) -> list[IssuedInvite]:
    """One invite per email. A person who already has a pending invite in this org gets it updated
    (workspaces added, roles kept at the higher one) and a fresh link, instead of a second invite."""
    from app.services.plan_features import assert_plan_allows_invites

    assert_plan_allows_invites(ctx.org.plan)
    emails = normalize_emails(emails)
    manageable = {ws.slug: ws for ws in await manageable_workspaces(db, ctx)}
    if org_admin and not await can_invite_org_admins(db, ctx):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an org owner or admin can invite org admins")
    if not manageable and not org_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: org.member.invite")

    wanted = Grants(org_role="admin" if org_admin else "member")
    for slug, role in workspaces:
        if role not in ROLE_RANK:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace role must be viewer, member or admin")
        ws = manageable.get(slug)
        if not ws:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"You can't invite people to {slug}")
        wanted.add_workspace(ws.id, role)
    if not org_admin and not wanted.workspaces:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pick at least one workspace")

    plans: list[tuple[str, list[Invite], Grants]] = []
    for email in emails:
        existing = await pending_invites_for(db, ctx.org_id, email)
        grants = Grants()
        for inv in existing:
            grants.merge(await invite_grants(db, inv))
        grants.merge(wanted)
        plans.append((email, existing, grants))

    brand_new = sum(1 for _, existing, _ in plans if not existing)
    if brand_new:
        await require_limit(db, ctx.org_id, "max_pending_invites", pending_delta=brand_new)
    for _, _, grants in plans:
        await require_role_capacity(db, ctx.org_id, grants.top_role)
    await require_licences_for_emails(
        db,
        ctx.org_id,
        [email for email, _, grants in plans if grants.grants_licence],
        exclude_invite_ids=[inv.id for _, existing, _ in plans for inv in existing],
    )

    issued: list[IssuedInvite] = []
    now = utc_now()
    for email, existing, grants in plans:
        if existing:
            invite, extra = existing[0], existing[1:]
            for other in extra:  # fold duplicates into one row per person
                other.status = "revoked"
                other.revoked_at = now
        else:
            invite = Invite(
                id=uuid.uuid4(),
                org_id=ctx.org_id,
                email=email,
                role=grants.top_role,
                status="pending",
                token_hash="pending-" + secrets.token_hex(8),
                created_by=ctx.user_id,
            )
            db.add(invite)
        invite.expires_at = utc_now_plus(days=INVITE_DAYS)
        # Keep the link already sent when it can be rebuilt; otherwise issue a new one.
        token = (current_token(invite) if existing else None) or issue_link(invite)
        await db.flush()
        await write_grants(db, invite, grants)
        issued.append(IssuedInvite(invite=invite, token=token, merged=bool(existing), grants=grants))
    await db.flush()
    return issued


# ── Accept ────────────────────────────────────────────────────────────────────


@dataclass
class AcceptResult:
    org_slug: str
    org_role: str
    workspace_slug: str | None
    already: bool


async def _first_open_workspace(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, org_role: str, order: list[uuid.UUID]) -> str | None:
    from app.services.tenancy import enroll_org_member_in_workspaces

    if order:
        rows = (await db.execute(select(Workspace).where(Workspace.id.in_(order)))).scalars().all()
        by_id = {ws.id: ws for ws in rows}
        member_of = set()
        if org_role not in ORG_ADMIN_ROLES:
            member_of = {
                r[0]
                for r in (
                    await db.execute(
                        select(WorkspaceMembership.workspace_id).where(
                            WorkspaceMembership.user_id == user_id, WorkspaceMembership.workspace_id.in_(order)
                        )
                    )
                ).all()
            }
        for ws_id in order:
            if ws_id in by_id and (org_role in ORG_ADMIN_ROLES or ws_id in member_of):
                return by_id[ws_id].slug
    return await enroll_org_member_in_workspaces(db, org_id=org_id, user_id=user_id, org_role=org_role)


async def accept(db: AsyncSession, user: User, invite: Invite, org: Org) -> AcceptResult:
    membership = (
        await db.execute(select(OrgMembership).where(OrgMembership.user_id == user.id, OrgMembership.org_id == org.id))
    ).scalar_one_or_none()

    if invite.status == "accepted":
        # Same person opening the link again: send them in, not an error.
        if membership and user.email.lower() == invite.email.lower():
            grants = await invite_grants(db, invite)
            slug = await _first_open_workspace(db, org.id, user.id, membership.role, grants.order)
            return AcceptResult(org.slug, membership.role, slug, already=True)
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite already used")

    invites = await pending_invites_for(db, org.id, invite.email)
    if invite not in invites:
        invites.insert(0, invite)
    grants = Grants()
    for inv in invites:
        grants.merge(await invite_grants(db, inv))

    changed = False
    needs_licence = False
    if membership is None:
        await require_role_capacity(db, org.id, grants.org_role)
        membership = OrgMembership(user_id=user.id, org_id=org.id, role=grants.org_role)
        db.add(membership)
        changed = True
        needs_licence = grants.org_role in EDITOR_ORG_ROLES
    elif ORG_RANK.get(grants.org_role, 0) > ORG_RANK.get(membership.role, 0):
        await require_role_capacity(db, org.id, grants.org_role)
        membership.role = grants.org_role
        changed = True
        needs_licence = True

    if membership.role not in ORG_ADMIN_ROLES and grants.workspaces:
        existing = {
            row.workspace_id: row
            for row in (
                await db.execute(
                    select(WorkspaceMembership).where(
                        WorkspaceMembership.user_id == user.id,
                        WorkspaceMembership.workspace_id.in_(list(grants.workspaces)),
                    )
                )
            ).scalars()
        }
        live = {r[0] for r in (await db.execute(select(Workspace.id).where(Workspace.id.in_(list(grants.workspaces)), Workspace.org_id == org.id))).all()}
        raised: set[str] = set()
        for ws_id in grants.order:
            if ws_id not in live:
                continue
            role = grants.workspaces[ws_id]
            row = existing.get(ws_id)
            if row is None:
                db.add(WorkspaceMembership(user_id=user.id, workspace_id=ws_id, role=role))
            elif ROLE_RANK[role] > ROLE_RANK.get(row.role, -1):
                row.role = role
            else:
                continue
            changed = True
            raised.add(role)
            if role in EDITOR_WORKSPACE_ROLES:
                needs_licence = True
        for role in sorted(raised, key=lambda r: ROLE_RANK[r]):
            await require_role_capacity(db, org.id, role)

    if needs_licence:
        await require_licence(db, org.id, user_id=user.id, email=user.email, exclude_invite_ids=[inv.id for inv in invites])

    now = utc_now()
    for inv in invites:
        inv.status = "accepted"
        inv.consumed_at = now
    await db.flush()
    slug = await _first_open_workspace(db, org.id, user.id, membership.role, grants.order)
    return AcceptResult(org.slug, membership.role, slug, already=not changed)


# ── Describe (preview page, People list, email) ───────────────────────────────


async def describe_workspaces(db: AsyncSession, grants: Grants) -> list[dict]:
    if not grants.order:
        return []
    rows = (await db.execute(select(Workspace).where(Workspace.id.in_(grants.order)))).scalars().all()
    by_id = {ws.id: ws for ws in rows}
    return [
        {"slug": by_id[ws_id].slug, "name": by_id[ws_id].name, "role": grants.workspaces[ws_id]}
        for ws_id in grants.order
        if ws_id in by_id
    ]

