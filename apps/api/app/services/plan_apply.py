"""Apply billing plan + limits to an org (used by admin script and Stripe webhooks)."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.authz import OrgLimit
from app.models.tenancy import Org
from app.services.plan_features import limits_for_plan, normalize_plan

LIMIT_KEYS = (
    "max_owners",
    "max_admins",
    "max_members",
    "max_viewers",
    "max_workspaces",
    "max_objects_per_workspace",
    "max_pending_invites",
    "max_active_share_links",
)


async def apply_plan_to_org(
    db: AsyncSession,
    org_id: uuid.UUID,
    plan: str,
    *,
    contributors: int | None = None,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    clear_stripe: bool = False,
) -> Org:
    normalized = normalize_plan(plan)
    target_limits = limits_for_plan(normalized)
    if normalized == "business" and contributors is not None:
        target_limits["max_members"] = contributors

    result = await db.execute(select(Org).where(Org.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise ValueError(f"Org not found: {org_id}")

    org.plan = normalized
    if stripe_customer_id is not None:
        org.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id is not None:
        org.stripe_subscription_id = stripe_subscription_id
    if clear_stripe:
        org.stripe_subscription_id = None

    for key in LIMIT_KEYS:
        if key not in target_limits:
            continue
        value = target_limits[key]
        existing = await db.execute(
            select(OrgLimit).where(OrgLimit.org_id == org_id, OrgLimit.limit_key == key)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(OrgLimit(org_id=org_id, limit_key=key, value=value))

    await db.flush()
    return org
