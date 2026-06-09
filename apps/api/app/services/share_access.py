"""Share link resolution, plan gating, and read-path allowlists."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import Workspace
from app.models.shares import ShareLink
from app.models.tenancy import Org
from app.services.authorization import hash_token
from app.services.tenancy import _set_rls_org
from app.utils.time import as_utc_naive, utc_now

from app.services.plan_features import plan_allows_share as _plan_allows_share

# View keys shareable on starter+
SHAREABLE_VIEW_KEYS = {
    "views/products",
    "views/capability-heatmap",
    "views/tech-debt",
    "views/journeys",
    "views/investments",
}

# Read-only API suffixes allowed per share (relative to workspace base)
SHARE_DATA_ALLOWLIST: dict[tuple[str, str | None], set[str]] = {
    ("view", "views/products"): {
        "workspace/summary",
        "products",
        "objects",
        "relationships",
        "capability-map/heatmap",
    },
    ("view", "views/capability-heatmap"): {
        "workspace/summary",
        "capability-map",
        "capability-map/heatmap",
        "products",
        "objects",
    },
    ("view", "views/tech-debt"): {
        "workspace/summary",
        "objects",
        "products",
        "relationships",
    },
    ("view", "views/journeys"): {
        "workspace/summary",
        "journeys",
        "objects",
        "relationships",
    },
    ("view", "views/investments"): {
        "workspace/summary",
        "objects",
        "products",
        "relationships",
    },
    ("roadmap", None): {"objects", "relationships"},
    ("object", None): {"objects", "relationships"},
    ("capability_map", None): {
        "capability-map",
        "capability-map/heatmap",
        "capability-map/status",
        "objects",
        "products",
    },
    ("capability_domain", None): {
        "capability-map/domains",
        "objects",
        "products",
        "relationships",
    },
}


@dataclass
class ShareContext:
    link: ShareLink
    org: Org
    workspace: Workspace


def plan_allows_share(org_plan: str, resource_type: str) -> bool:
    return _plan_allows_share(org_plan, resource_type)


def validate_share_create(org_plan: str, resource_type: str, resource_key: str | None) -> None:
    if not plan_allows_share(org_plan, resource_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "plan_feature_unavailable",
                "message": f"Sharing {resource_type} is not available on the {org_plan} plan. Upgrade to Solo or Team.",
            },
        )
    if resource_type == "view":
        if not resource_key or resource_key not in SHAREABLE_VIEW_KEYS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or unsupported view for sharing",
            )


async def resolve_share(db: AsyncSession, raw_token: str) -> ShareContext:
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(ShareLink, Org, Workspace)
        .join(Org, Org.id == ShareLink.org_id)
        .join(Workspace, Workspace.id == ShareLink.workspace_id)
        .where(ShareLink.token_hash == token_hash)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    link, org, workspace = row
    now = utc_now()

    if link.status == "revoked":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link revoked")
    if link.status == "expired" or as_utc_naive(link.expires_at) < now:
        if link.status == "active":
            link.status = "expired"
            await db.flush()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link expired")

    await _set_rls_org(db, org.id)
    return ShareContext(link=link, org=org, workspace=workspace)


def share_is_expired(link: ShareLink) -> bool:
    return link.status == "expired" or (
        link.status == "active" and as_utc_naive(link.expires_at) < utc_now()
    )


def assert_share_data_path(ctx: ShareContext, path: str) -> None:
    """path is relative to workspace, e.g. 'products' or 'objects/{id}'."""
    key = (ctx.link.resource_type, ctx.link.resource_key if ctx.link.resource_type == "view" else None)
    allowed = SHARE_DATA_ALLOWLIST.get(key)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Share data path not configured")

    normalized = path.strip("/")
    if normalized in allowed:
        return

    for prefix in allowed:
        if normalized.startswith(prefix + "/") or normalized == prefix:
            if ctx.link.resource_type == "object" and ctx.link.resource_id:
                if not normalized.startswith(f"objects/{ctx.link.resource_id}"):
                    if normalized.startswith("objects/"):
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Object scope exceeded")
            if ctx.link.resource_type == "roadmap" and ctx.link.resource_id:
                if normalized.startswith("objects/") and not normalized.startswith(
                    f"objects/{ctx.link.resource_id}"
                ):
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Roadmap scope exceeded")
            if ctx.link.resource_type == "capability_domain" and ctx.link.resource_id:
                domain_prefix = f"capability-map/domains/{ctx.link.resource_id}"
                if normalized.startswith("capability-map/domains/") and not normalized.startswith(domain_prefix):
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Domain scope exceeded")
            return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Data path not allowed for this share")


async def count_active_share_links(db: AsyncSession, org_id: uuid.UUID) -> int:
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
    return result.scalar_one()
