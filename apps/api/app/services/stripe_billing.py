"""Stripe Checkout + webhooks for Solo self-serve upgrades."""
from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.tenancy import Org
from app.services.audit import log_audit
from app.services.plan_apply import apply_plan_to_org
from app.services.plan_features import normalize_plan

logger = logging.getLogger(__name__)


def stripe_configured() -> bool:
    return bool(settings.stripe_secret_key.strip() and settings.stripe_solo_price_id.strip())


def _stripe():
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


async def create_solo_checkout_session(
    db: AsyncSession,
    org: Org,
    *,
    user_email: str,
    user_id: uuid.UUID,
) -> tuple[str, str]:
    if not stripe_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_SOLO_PRICE_ID on the API.",
        )

    current = normalize_plan(org.plan)
    if current == "solo":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This org is already on the Solo plan.",
        )
    if current == "team":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team plans are arranged manually. Contact us to change your plan.",
        )

    stripe = _stripe()
    base = settings.web_app_url.rstrip("/")
    success_url = f"{base}/orgs/{org.slug}/settings?billing=success"
    cancel_url = f"{base}/orgs/{org.slug}/settings?billing=cancelled"

    session_kwargs: dict = {
        "mode": "subscription",
        "line_items": [{"price": settings.stripe_solo_price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(org.id),
        "metadata": {
            "org_id": str(org.id),
            "org_slug": org.slug,
            "plan": "solo",
        },
        "subscription_data": {
            "metadata": {
                "org_id": str(org.id),
                "org_slug": org.slug,
                "plan": "solo",
            },
        },
    }

    if org.stripe_customer_id:
        session_kwargs["customer"] = org.stripe_customer_id
    else:
        session_kwargs["customer_email"] = user_email

    session = stripe.checkout.Session.create(**session_kwargs)
    if not session.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a checkout URL.",
        )

    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=user_id,
        action="billing.checkout_started",
        target_type="org",
        target_id=org.id,
        metadata={"plan": "solo", "session_id": session.id},
    )

    return session.url, session.id


async def handle_stripe_event(db: AsyncSession, event: dict) -> None:
    event_type = event.get("type")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        await _on_checkout_completed(db, data)
    elif event_type == "customer.subscription.deleted":
        await _on_subscription_deleted(db, data)
    else:
        logger.debug("Unhandled Stripe event: %s", event_type)


async def _org_by_stripe_refs(
    db: AsyncSession,
    *,
    org_id: str | None,
    customer_id: str | None,
    subscription_id: str | None,
) -> Org | None:
    if org_id:
        try:
            oid = uuid.UUID(org_id)
        except ValueError:
            oid = None
        if oid:
            result = await db.execute(select(Org).where(Org.id == oid))
            org = result.scalar_one_or_none()
            if org:
                return org

    if subscription_id:
        result = await db.execute(select(Org).where(Org.stripe_subscription_id == subscription_id))
        org = result.scalar_one_or_none()
        if org:
            return org

    if customer_id:
        result = await db.execute(select(Org).where(Org.stripe_customer_id == customer_id))
        return result.scalar_one_or_none()

    return None


async def _on_checkout_completed(db: AsyncSession, session: dict) -> None:
    metadata = session.get("metadata") or {}
    org_id = metadata.get("org_id") or session.get("client_reference_id")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    plan = metadata.get("plan", "solo")

    if session.get("mode") != "subscription" or not subscription_id:
        logger.warning("checkout.session.completed ignored: not a subscription checkout")
        return

    org = await _org_by_stripe_refs(
        db,
        org_id=org_id,
        customer_id=customer_id if isinstance(customer_id, str) else None,
        subscription_id=None,
    )
    if not org:
        logger.error("checkout.session.completed: org not found org_id=%s", org_id)
        return

    await apply_plan_to_org(
        db,
        org.id,
        plan,
        stripe_customer_id=customer_id if isinstance(customer_id, str) else org.stripe_customer_id,
        stripe_subscription_id=subscription_id if isinstance(subscription_id, str) else None,
    )
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=None,
        action="billing.plan_upgraded",
        target_type="org",
        target_id=org.id,
        metadata={"plan": plan, "subscription_id": subscription_id},
    )
    await db.commit()
    logger.info("Upgraded org %s to %s via Stripe", org.slug, plan)


async def _on_subscription_deleted(db: AsyncSession, subscription: dict) -> None:
    subscription_id = subscription.get("id")
    metadata = subscription.get("metadata") or {}
    customer_id = subscription.get("customer")

    org = await _org_by_stripe_refs(
        db,
        org_id=metadata.get("org_id"),
        customer_id=customer_id if isinstance(customer_id, str) else None,
        subscription_id=subscription_id if isinstance(subscription_id, str) else None,
    )
    if not org:
        logger.warning("subscription.deleted: org not found sub=%s", subscription_id)
        return

    if normalize_plan(org.plan) == "team":
        logger.info("subscription.deleted ignored for team org %s", org.slug)
        return

    await apply_plan_to_org(db, org.id, "free", clear_stripe=True)
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=None,
        action="billing.plan_downgraded",
        target_type="org",
        target_id=org.id,
        metadata={"plan": "free", "reason": "subscription_deleted"},
    )
    await db.commit()
    logger.info("Downgraded org %s to free after subscription ended", org.slug)
