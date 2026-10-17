"""Generic authorization and quota checks — roles and limits are data, not code."""
from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from app.utils.time import as_utc_naive, utc_now, utc_now_plus

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.authz import OrgLimit, Permission, RolePermission
from app.models.objects import MinEAObject, Workspace
from app.models.tenancy import Invite, Org, OrgMembership, WorkspaceMembership
from app.services.defaults import DEFAULT_ORG_LIMITS, ROLE_LIMIT_KEYS

ORG_ADMIN_ROLES = {"owner", "admin"}

# In-memory cache: (role_scope, role_slug) -> set(permission_slug)
_permission_cache: dict[tuple[str, str], set[str]] = {}
_permission_meta: dict[str, str] = {}  # slug -> scope


@dataclass
class AuthScope:
    org_id: uuid.UUID
    org_role: str | None
    workspace_id: uuid.UUID | None = None
    workspace_role: str | None = None
    email_verified: bool = False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_invite_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


async def load_permission_cache(db: AsyncSession) -> None:
    global _permission_cache, _permission_meta
    result = await db.execute(
        select(RolePermission.role_scope, RolePermission.role_slug, RolePermission.permission_slug)
    )
    cache: dict[tuple[str, str], set[str]] = {}
    for role_scope, role_slug, perm_slug in result.all():
        cache.setdefault((role_scope, role_slug), set()).add(perm_slug)

    perm_result = await db.execute(select(Permission.slug, Permission.scope))
    meta = {slug: scope for slug, scope in perm_result.all()}

    _permission_cache = cache
    _permission_meta = meta


async def seed_org_limits(db: AsyncSession, org_id: uuid.UUID, plan: str = "free") -> None:
    from app.services.plan_features import limits_for_plan

    for key, value in limits_for_plan(plan).items():
        existing = await db.execute(
            select(OrgLimit).where(OrgLimit.org_id == org_id, OrgLimit.limit_key == key)
        )
        if existing.scalar_one_or_none() is None:
            db.add(OrgLimit(org_id=org_id, limit_key=key, value=value))
    await db.flush()


_MISSING = object()


async def _stored_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str):
    """The org_limits value, or _MISSING when the org has no row for the key. A row holding NULL
    returns None: "no cap" (what apply_plan_to_org writes for paid plans)."""
    row = (
        await db.execute(
            select(OrgLimit.value).where(OrgLimit.org_id == org_id, OrgLimit.limit_key == limit_key)
        )
    ).first()
    return _MISSING if row is None else row[0]


async def plan_default_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str) -> int | None:
    """The org's plan default for a key it has no row for: limits_for_plan (plans.json / plan_features
    on top of DEFAULT_ORG_LIMITS). Business without a subscription gets the legacy limits, as
    apply_plan_to_org would write. A key no plan defines is None (no cap)."""
    from app.services.plan_features import limits_for_plan

    org = (await db.execute(select(Org.plan, Org.stripe_subscription_id).where(Org.id == org_id))).first()
    if org is None:
        return DEFAULT_ORG_LIMITS.get(limit_key)
    return limits_for_plan(org[0] or "free", stripe_managed=bool(org[1])).get(limit_key)


async def get_org_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str) -> int | None:
    """An org's cap for a limit key; None = no cap.

    A stored NULL is no cap (paid plans write it on upgrade). Only a missing row falls back to the
    plan default. Earlier, NULL fell back to DEFAULT_ORG_LIMITS too, which quietly capped paid orgs
    at 10 workspaces, 5 admins, 50 members/viewers and 1000 objects."""
    value = await _stored_limit(db, org_id, limit_key)
    if value is _MISSING:
        return await plan_default_limit(db, org_id, limit_key)
    return value


async def org_limit_override(db: AsyncSession, org_id: uuid.UUID, limit_key: str) -> tuple[bool, int | None]:
    """(has_row, value) for keys whose missing-row default lives outside org_limits (e.g. the Ask
    allowance in plans.json). value None with has_row True = no cap."""
    value = await _stored_limit(db, org_id, limit_key)
    return (False, None) if value is _MISSING else (True, value)


def _effective_role(scope: AuthScope, permission_slug: str) -> tuple[str, str] | None:
    perm_scope = _permission_meta.get(permission_slug)
    if not perm_scope:
        return None

    if perm_scope == "org":
        if not scope.org_role:
            return None
        return ("org", scope.org_role)

    # Workspace-scoped permission
    if scope.org_role in ORG_ADMIN_ROLES:
        return ("workspace", "admin")
    if scope.workspace_role:
        return ("workspace", scope.workspace_role)
    return None


async def can(db: AsyncSession, scope: AuthScope, permission: str) -> bool:
    if not _permission_cache:
        await load_permission_cache(db)

    perm_scope = _permission_meta.get(permission)
    if not perm_scope:
        return False

    # Email verification gate for sensitive org actions
    if permission in {
        "org.member.invite",
        "org.role.assign",
        "org.delete",
        "org.billing.manage",
        "org.transfer",
        "workspace.member.invite",
    } and not scope.email_verified:
        return False

    effective = _effective_role(scope, permission)
    if not effective:
        return False

    role_scope, role_slug = effective
    granted = _permission_cache.get((role_scope, role_slug), set())
    return permission in granted


async def require_permission(db: AsyncSession, scope: AuthScope, permission: str) -> None:
    if not await can(db, scope, permission):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Permission denied: {permission}")


async def _count_role_assignments(db: AsyncSession, org_id: uuid.UUID, role: str) -> int:
    """Distinct users holding a role in the org (org + workspace memberships)."""
    org_users = await db.execute(
        select(OrgMembership.user_id).where(OrgMembership.org_id == org_id, OrgMembership.role == role)
    )
    ws_users = await db.execute(
        select(WorkspaceMembership.user_id)
        .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
        .where(Workspace.org_id == org_id, WorkspaceMembership.role == role)
    )
    user_ids = {row[0] for row in org_users.all()} | {row[0] for row in ws_users.all()}
    return len(user_ids)


async def _count_pending_invites(db: AsyncSession, org_id: uuid.UUID, role: str | None = None) -> int:
    now = utc_now()
    q = select(func.count()).select_from(Invite).where(
        Invite.org_id == org_id,
        Invite.status == "pending",
        Invite.expires_at > now,
    )
    if role:
        q = q.where(Invite.role == role)
    result = await db.execute(q)
    return result.scalar_one()


async def _count_role_usage(db: AsyncSession, org_id: uuid.UUID, role: str) -> int:
    assigned = await _count_role_assignments(db, org_id, role)
    pending = await _count_pending_invites(db, org_id, role)
    return assigned + pending


async def get_object_cap(db: AsyncSession, org_id: uuid.UUID) -> int | None:
    """max_objects_per_workspace (apps & AI agents) for the org: NULL row = no cap, no row = plan default."""
    return await get_org_limit(db, org_id, "max_objects_per_workspace")


# What max_objects_per_workspace counts: apps and AI agents. Everything else (platforms/tenants,
# servers, AI models, capabilities, data, locations, vendors, …) is unlimited on every plan.
# The key name stays for compatibility with stored org_limits rows and per-org overrides.
LIMITED_OBJECT_TYPES = frozenset({"application", "agent"})


def counted_types(types) -> int:
    """How many of these object types the limit counts."""
    return sum(1 for t in types if t in LIMITED_OBJECT_TYPES)


async def count_workspace_objects(db: AsyncSession, workspace_id: uuid.UUID) -> int:
    """Apps and AI agents in the workspace (the types the limit counts)."""
    result = await db.execute(
        select(func.count())
        .select_from(MinEAObject)
        .where(MinEAObject.workspace_id == workspace_id, MinEAObject.type.in_(LIMITED_OBJECT_TYPES))
    )
    return int(result.scalar_one())


async def _org_plan(db: AsyncSession, org_id: uuid.UUID) -> str:
    from app.services.plan_features import normalize_plan

    result = await db.execute(select(Org.plan).where(Org.id == org_id))
    return normalize_plan(result.scalar_one_or_none())


async def object_room(db: AsyncSession, org_id: uuid.UUID, workspace_id: uuid.UUID) -> dict:
    """Apps & AI agents in the workspace and the org's real cap (org_limits overrides included) for the web's
    pre-check. max/remaining are None when there is no cap."""
    cap = await get_object_cap(db, org_id)
    current = await count_workspace_objects(db, workspace_id)
    return {
        "limit": "max_objects_per_workspace",
        "current": current,
        "max": cap,
        "remaining": None if cap is None else max(cap - current, 0),
        "plan": await _org_plan(db, org_id),
    }


async def require_object_room(
    db: AsyncSession, org_id: uuid.UUID, workspace_id: uuid.UUID, adding: int = 1
) -> None:
    """403 limit_exceeded when adding this many apps/AI agents would pass max_objects_per_workspace."""
    if adding <= 0:
        return
    await require_limit(db, org_id, "max_objects_per_workspace", workspace_id=workspace_id, pending_delta=adding)


async def check_limit(
    db: AsyncSession,
    org_id: uuid.UUID,
    limit_key: str,
    *,
    workspace_id: uuid.UUID | None = None,
    role: str | None = None,
    pending_delta: int = 0,
) -> tuple[bool, dict | None]:
    """Return (ok, error_detail). null limit value means unlimited."""
    cap = await get_org_limit(db, org_id, limit_key)
    if cap is None:
        return True, None

    current = 0

    if limit_key == "max_owners":
        result = await db.execute(
            select(func.count()).select_from(OrgMembership).where(
                OrgMembership.org_id == org_id, OrgMembership.role == "owner"
            )
        )
        current = result.scalar_one()
    elif limit_key in ("max_admins", "max_members", "max_viewers"):
        role_name = {"max_admins": "admin", "max_members": "member", "max_viewers": "viewer"}[limit_key]
        current = await _count_role_usage(db, org_id, role_name)
        if pending_delta:
            current += pending_delta
    elif limit_key == "max_workspaces":
        result = await db.execute(
            select(func.count()).select_from(Workspace).where(Workspace.org_id == org_id)
        )
        current = result.scalar_one() + max(pending_delta, 0)
    elif limit_key == "max_objects_per_workspace" and workspace_id:
        # Apps and AI agents in the workspace (LIMITED_OBJECT_TYPES). Callers pass how many of
        # those they add: 50 stored blocks the 51st, a batch that would pass the cap is refused whole
        # (one transaction). Edits and deletes never call this, so a workspace already over can change.
        current = await count_workspace_objects(db, workspace_id)
        adding = max(pending_delta, 0)
        if current + adding > cap:
            return False, {
                "code": "limit_exceeded",
                "limit": limit_key,
                "current": current,
                "max": cap,
                "adding": adding,
                "remaining": max(cap - current, 0),
                "plan": await _org_plan(db, org_id),
            }
        return True, None
    elif limit_key == "max_pending_invites":
        current = await _count_pending_invites(db, org_id)
        if pending_delta:
            current += pending_delta
    elif limit_key == "max_active_share_links":
        from app.models.shares import ShareLink

        now = utc_now()
        result = await db.execute(
            select(func.count())
            .select_from(ShareLink)
            .where(
                ShareLink.org_id == org_id,
                ShareLink.status == "active",
                ShareLink.expires_at > now,
            )
        )
        current = result.scalar_one()
        if pending_delta:
            current += pending_delta
    elif limit_key == "ai_extractions_per_month":
        month_start = utc_now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        result = await db.execute(
            text(
                """
                SELECT COUNT(*) FROM audit_log
                WHERE org_id = :org_id
                  AND action = 'extraction.run'
                  AND created_at >= :month_start
                """
            ),
            {"org_id": str(org_id), "month_start": month_start},
        )
        current = result.scalar_one() + max(pending_delta, 0)
    else:
        # Limits reserved for future resource types — allow if not tracked yet
        return True, None

    if current > cap:
        return False, {
            "code": "limit_exceeded",
            "limit": limit_key,
            "current": current,
            "max": cap,
        }
    return True, None


async def require_limit(
    db: AsyncSession,
    org_id: uuid.UUID,
    limit_key: str,
    **kwargs,
) -> None:
    ok, detail = await check_limit(db, org_id, limit_key, **kwargs)
    if not ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def require_role_capacity(
    db: AsyncSession,
    org_id: uuid.UUID,
    role: str,
) -> None:
    limit_key = ROLE_LIMIT_KEYS.get(role)
    if not limit_key:
        return
    ok, detail = await check_limit(db, org_id, limit_key, pending_delta=1)
    if not ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def invite_is_active(invite: Invite) -> bool:
    if invite.status != "pending":
        return False
    return as_utc_naive(invite.expires_at) > utc_now()
