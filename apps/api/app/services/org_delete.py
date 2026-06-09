"""Permanently delete an org and all dependent data."""
from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenancy import Org
from app.services.audit import log_audit
from app.services.stripe_billing import stripe_configured

logger = logging.getLogger(__name__)


def _cancel_stripe_subscription(org: Org) -> None:
    if not org.stripe_subscription_id or not stripe_configured():
        return
    try:
        import stripe

        from app.config import settings

        stripe.api_key = settings.stripe_secret_key
        stripe.Subscription.cancel(org.stripe_subscription_id)
    except Exception as exc:
        logger.warning(
            "Stripe subscription cancel failed for org %s: %s",
            org.slug,
            exc,
        )


async def delete_org_permanently(
    db: AsyncSession,
    *,
    org: Org,
    actor_user_id: uuid.UUID,
) -> None:
    """Delete org row; Postgres ON DELETE CASCADE removes workspaces, memberships, data."""
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=actor_user_id,
        action="org.deleted",
        target_type="org",
        target_id=org.id,
        metadata={"slug": org.slug},
    )
    await db.flush()

    _cancel_stripe_subscription(org)

    result = await db.execute(
        text("DELETE FROM orgs WHERE id = :org_id"),
        {"org_id": str(org.id)},
    )
    if result.rowcount != 1:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete organization",
        )
