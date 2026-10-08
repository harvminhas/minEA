"""Licence (editor seat) counting and the licence cap.

A licence = someone who can edit: org owner/admin, anyone with a workspace admin/member role in
the org, plus pending invites that would create one (org admin invites, workspace admin/member
invites). Viewers are free. Same rule as apps/web/lib/billing/licences.ts.

The cap lives in org_limits.max_editor_seats (NULL/missing = no cap, e.g. Business legacy).
It is only checked when someone NEW would get a licence. Existing editors always keep access
and reads are never gated, so a downgrade can leave an org over its cap (shown as a banner).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import Workspace
from app.models.tenancy import Invite, OrgMembership, User, WorkspaceMembership
from app.services.plan_features import EDITOR_SEATS_KEY
from app.utils.time import utc_now

EDITOR_ORG_ROLES = ("owner", "admin")
EDITOR_WORKSPACE_ROLES = ("admin", "member")


@dataclass
class LicenceUsage:
    holder_ids: set[uuid.UUID] = field(default_factory=set)
    holder_emails: set[str] = field(default_factory=set)
    pending_emails: set[str] = field(default_factory=set)

    @property
    def used(self) -> int:
        return len(self.holder_ids) + len(self.pending_emails)


def invite_grants_licence(*, workspace_id: uuid.UUID | None, role: str) -> bool:
    if workspace_id is None:
        return role in EDITOR_ORG_ROLES
    return role in EDITOR_WORKSPACE_ROLES


def build_usage(
    holders: Iterable[tuple[uuid.UUID, str | None]],
    pending_invites: Iterable[tuple[uuid.UUID, str]],
    *,
    exclude_invite_id: uuid.UUID | None = None,
) -> LicenceUsage:
    """holders: (user_id, email); pending_invites: (invite_id, email) that grant a licence."""
    usage = LicenceUsage()
    for user_id, email in holders:
        usage.holder_ids.add(user_id)
        if email:
            usage.holder_emails.add(email.strip().lower())
    for invite_id, email in pending_invites:
        if exclude_invite_id is not None and invite_id == exclude_invite_id:
            continue
        normalized = (email or "").strip().lower()
        if normalized and normalized not in usage.holder_emails:
            usage.pending_emails.add(normalized)
    return usage


def needs_new_licence(
    usage: LicenceUsage, *, user_id: uuid.UUID | None = None, email: str | None = None
) -> bool:
    if user_id is not None and user_id in usage.holder_ids:
        return False
    normalized = (email or "").strip().lower()
    if normalized and (normalized in usage.holder_emails or normalized in usage.pending_emails):
        return False
    return True


def licence_limit_detail(used: int, cap: int) -> dict:
    return {
        "code": "licence_limit",
        "limit": EDITOR_SEATS_KEY,
        "current": used,
        "max": cap,
        "message": (
            f"All {cap} licence{'s are' if cap != 1 else ' is'} in use ({used} assigned). "
            "Add them as a viewer, free up a licence, or upgrade in Settings → Plan & billing."
        ),
    }


async def load_usage(
    db: AsyncSession, org_id: uuid.UUID, *, exclude_invite_id: uuid.UUID | None = None
) -> LicenceUsage:
    org_rows = await db.execute(
        select(OrgMembership.user_id, User.email)
        .join(User, User.id == OrgMembership.user_id)
        .where(OrgMembership.org_id == org_id, OrgMembership.role.in_(EDITOR_ORG_ROLES))
    )
    ws_rows = await db.execute(
        select(WorkspaceMembership.user_id, User.email)
        .join(User, User.id == WorkspaceMembership.user_id)
        .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
        .where(Workspace.org_id == org_id, WorkspaceMembership.role.in_(EDITOR_WORKSPACE_ROLES))
    )
    invite_rows = await db.execute(
        select(Invite.id, Invite.email).where(
            Invite.org_id == org_id,
            Invite.status == "pending",
            Invite.expires_at > utc_now(),
            or_(
                and_(Invite.workspace_id.is_(None), Invite.role.in_(EDITOR_ORG_ROLES)),
                and_(Invite.workspace_id.is_not(None), Invite.role.in_(EDITOR_WORKSPACE_ROLES)),
            ),
        )
    )
    holders = [(r[0], r[1]) for r in org_rows.all()] + [(r[0], r[1]) for r in ws_rows.all()]
    return build_usage(holders, [(r[0], r[1]) for r in invite_rows.all()], exclude_invite_id=exclude_invite_id)


async def licence_cap(db: AsyncSession, org_id: uuid.UUID) -> int | None:
    from app.services.authorization import get_org_limit

    return await get_org_limit(db, org_id, EDITOR_SEATS_KEY)


async def require_licence(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    user_id: uuid.UUID | None = None,
    email: str | None = None,
    exclude_invite_id: uuid.UUID | None = None,
) -> None:
    """Raise 403 licence_limit if giving this person edit access would exceed the cap."""
    cap = await licence_cap(db, org_id)
    if cap is None:
        return
    usage = await load_usage(db, org_id, exclude_invite_id=exclude_invite_id)
    if not needs_new_licence(usage, user_id=user_id, email=email):
        return
    if usage.used + 1 > cap:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=licence_limit_detail(usage.used, cap))
