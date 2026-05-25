"""Tenant isolation: resolve org/workspace from URL slugs and verify membership."""
import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.models.objects import Workspace
from app.models.tenancy import Org, OrgMembership, User, WorkspaceMembership
from app.services.authorization import AuthScope, can, require_permission
from app.services.roles import ORG_ADMIN_ROLES, WS_ADMIN, WS_MEMBER, WS_VIEWER, effective_workspace_role
from app.utils.time import utc_now


def workspace_role_for_org_member(org_role: str) -> str:
    if org_role in ORG_ADMIN_ROLES:
        return WS_ADMIN
    if org_role == WS_VIEWER:
        return WS_VIEWER
    return WS_MEMBER


def preferred_workspace_slug(workspaces: list[Workspace]) -> str | None:
    if not workspaces:
        return None
    default = next((ws for ws in workspaces if ws.slug == "default"), None)
    return (default or workspaces[0]).slug


async def enroll_org_member_in_workspaces(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    org_role: str,
) -> str | None:
    """Ensure org members have workspace rows so they can view objects. Returns redirect slug."""
    if org_role in ORG_ADMIN_ROLES:
        result = await db.execute(
            select(Workspace).where(Workspace.org_id == org_id).order_by(Workspace.created_at)
        )
        return preferred_workspace_slug(list(result.scalars().all()))

    existing = await db.execute(
        select(WorkspaceMembership.workspace_id)
        .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
        .where(WorkspaceMembership.user_id == user_id, Workspace.org_id == org_id)
        .limit(1)
    )
    if existing.scalar_one_or_none():
        accessible = await db.execute(
            select(Workspace)
            .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
            .where(WorkspaceMembership.user_id == user_id, Workspace.org_id == org_id)
            .order_by(Workspace.created_at)
        )
        return preferred_workspace_slug(list(accessible.scalars().all()))

    result = await db.execute(
        select(Workspace).where(Workspace.org_id == org_id).order_by(Workspace.created_at)
    )
    workspaces = list(result.scalars().all())
    if not workspaces:
        return None

    ws_role = workspace_role_for_org_member(org_role)
    for ws in workspaces:
        db.add(WorkspaceMembership(user_id=user_id, workspace_id=ws.id, role=ws_role))
    await db.flush()
    return preferred_workspace_slug(workspaces)


class TenancyContext:
    """Scoped tenant context derived from session + URL — never from request body."""

    def __init__(
        self,
        user: User,
        org: Org,
        org_role: str,
        workspace: Workspace | None = None,
        workspace_role: str | None = None,
        *,
        email_verified: bool = False,
    ):
        self.user = user
        self.org = org
        self.org_role = org_role
        self.workspace = workspace
        self.workspace_role = workspace_role
        self.email_verified = email_verified

    @property
    def org_id(self) -> uuid.UUID:
        return self.org.id

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id

    @property
    def effective_ws_role(self) -> str | None:
        if not self.workspace:
            return None
        return effective_workspace_role(self.org_role, self.workspace_role)

    def to_scope(self) -> AuthScope:
        return AuthScope(
            org_id=self.org_id,
            org_role=self.org_role,
            workspace_id=self.workspace.id if self.workspace else None,
            workspace_role=self.workspace_role,
            email_verified=self.email_verified,
        )

    async def require_permission(self, db: AsyncSession, permission: str) -> None:
        await require_permission(db, self.to_scope(), permission)

    async def has_permission(self, db: AsyncSession, permission: str) -> bool:
        return await can(db, self.to_scope(), permission)

    async def require_read(self, db: AsyncSession) -> None:
        await self.require_permission(db, "object.view")

    async def require_write(self, db: AsyncSession) -> None:
        if not self.workspace:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Write access denied")
        await self.require_permission(db, "object.edit")

    async def require_workspace_admin(self, db: AsyncSession) -> None:
        await self.require_permission(db, "workspace.settings.edit")

    async def require_org_admin(self, db: AsyncSession) -> None:
        if not await self.has_permission(db, "org.settings.edit"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Org admin access denied")


async def _set_rls_org(db: AsyncSession, org_id: uuid.UUID) -> None:
    """Set Postgres session variable for RLS policies."""
    await db.execute(text("SELECT set_config('app.org_id', :org_id, true)"), {"org_id": str(org_id)})


async def _resolve_user(db: AsyncSession, auth: AuthContext, *, create_if_missing: bool = False) -> User:
    result = await db.execute(select(User).where(User.firebase_uid == auth.firebase_uid))
    user = result.scalar_one_or_none()
    if not user and create_if_missing:
        user = User(
            firebase_uid=auth.firebase_uid,
            email=auth.email or f"{auth.firebase_uid}@unknown.local",
            full_name=auth.full_name,
            email_verified_at=utc_now() if auth.email_verified else None,
        )
        db.add(user)
        await db.flush()
    elif user:
        if auth.email and user.email != auth.email:
            user.email = auth.email
        if auth.full_name and user.full_name != auth.full_name:
            user.full_name = auth.full_name
        if auth.email_verified and not user.email_verified_at:
            user.email_verified_at = utc_now()
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not provisioned")
    return user


def _is_email_verified(user: User, auth: AuthContext) -> bool:
    return user.email_verified_at is not None or auth.email_verified


async def _resolve_org_membership(
    db: AsyncSession, user_id: uuid.UUID, org_slug: str
) -> tuple[Org, str]:
    result = await db.execute(
        select(Org, OrgMembership.role)
        .join(OrgMembership, OrgMembership.org_id == Org.id)
        .where(Org.slug == org_slug, OrgMembership.user_id == user_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this org")
    org, role = row
    return org, role


async def get_org_context(
    org_slug: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> TenancyContext:
    user = await _resolve_user(db, auth)
    org, org_role = await _resolve_org_membership(db, user.id, org_slug)
    await _set_rls_org(db, org.id)
    await enroll_org_member_in_workspaces(
        db, org_id=org.id, user_id=user.id, org_role=org_role
    )
    return TenancyContext(
        user=user,
        org=org,
        org_role=org_role,
        email_verified=_is_email_verified(user, auth),
    )


async def get_workspace_context(
    org_slug: str,
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
) -> TenancyContext:
    user = await _resolve_user(db, auth)
    org, org_role = await _resolve_org_membership(db, user.id, org_slug)
    await _set_rls_org(db, org.id)

    ws_result = await db.execute(
        select(Workspace).where(Workspace.org_id == org.id, Workspace.slug == workspace_slug)
    )
    workspace = ws_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    ws_role: str | None = None
    if org_role not in ORG_ADMIN_ROLES:
        mem_result = await db.execute(
            select(WorkspaceMembership.role).where(
                WorkspaceMembership.user_id == user.id,
                WorkspaceMembership.workspace_id == workspace.id,
            )
        )
        ws_role = mem_result.scalar_one_or_none()
        if not ws_role:
            await enroll_org_member_in_workspaces(
                db, org_id=org.id, user_id=user.id, org_role=org_role
            )
            mem_result = await db.execute(
                select(WorkspaceMembership.role).where(
                    WorkspaceMembership.user_id == user.id,
                    WorkspaceMembership.workspace_id == workspace.id,
                )
            )
            ws_role = mem_result.scalar_one_or_none()
        if not ws_role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this workspace")

    ctx = TenancyContext(
        user=user,
        org=org,
        org_role=org_role,
        workspace=workspace,
        workspace_role=ws_role,
        email_verified=_is_email_verified(user, auth),
    )

    if not await can(db, ctx.to_scope(), "object.view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access denied")

    return ctx
