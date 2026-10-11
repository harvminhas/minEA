"""In-app Help form and the "payment received, still setting up" check after Checkout."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.contact import SupportRequest
from app.schemas.support import (
    CheckoutPendingRequest,
    CheckoutPendingResponse,
    SupportRequestCreate,
    SupportRequestRead,
)
from app.services import support_alerts
from app.services.stripe_billing import retrieve_checkout_session, stripe_configured
from app.services.tenancy import TenancyContext, get_org_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs/{org_slug}", tags=["support"])

SESSION_ID_RE = re.compile(r"^cs_[A-Za-z0-9_]{6,250}$")
TOPIC_LABELS = {"billing": "Billing", "bug": "Something isn't working", "other": "Other"}


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.post("/support", response_model=SupportRequestRead, status_code=status.HTTP_201_CREATED)
async def submit_support_request(
    body: SupportRequestCreate,
    background: BackgroundTasks,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SupportRequest:
    """Any org member. Org slug and email come from the session, never the body."""
    session_id = _clean(body.checkout_session_id)
    if session_id and not SESSION_ID_RE.match(session_id):
        session_id = None
    req = SupportRequest(
        org_slug=ctx.org.slug,
        user_email=ctx.user.email,
        topic=body.topic,
        message=body.message.strip(),
        checkout_session_id=session_id,
        source=_clean(body.source),
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    background.add_task(
        support_alerts.send_owner_email,
        f"BuboMap help request: {TOPIC_LABELS[req.topic]} ({req.org_slug})",
        [
            ("Organisation", req.org_slug or "-"),
            ("From", req.user_email),
            ("Topic", TOPIC_LABELS[req.topic]),
            ("Checkout session", req.checkout_session_id or "-"),
            ("Sent from", req.source or "-"),
            ("Message", req.message),
        ],
        reply_to=req.user_email,
    )
    return req


@router.post("/billing/checkout-pending", response_model=CheckoutPendingResponse)
async def report_checkout_pending(
    body: CheckoutPendingRequest,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> CheckoutPendingResponse:
    """Called by the checkout return page while it shows "still setting up".

    No cron: this is the lazy check. The first call records the session; once the payment is
    5 minutes old and the org still has no subscription, the owner is emailed once per session.
    """
    session_id = body.session_id.strip()
    if not SESSION_ID_RE.match(session_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid checkout session")
    org = ctx.org
    if org.stripe_subscription_id:
        return CheckoutPendingResponse(status="active")

    started: datetime | None = None
    if stripe_configured():
        try:
            session = retrieve_checkout_session(session_id)
        except Exception as exc:  # Stripe unreachable: fall back to when we first heard of it
            logger.warning("Could not retrieve checkout session: %s", type(exc).__name__)
            session = None
        if session is not None:
            if str((session.get("metadata") or {}).get("org_id") or "") != str(org.id):
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Checkout session not found")
            if session.get("status") != "complete":
                return CheckoutPendingResponse(status="waiting")
            if session.get("created"):
                started = datetime.fromtimestamp(int(session["created"]), tz=timezone.utc)

    try:
        await support_alerts.record_once(db, "checkout_seen", f"checkout_seen:{session_id}", org_slug=org.slug)
        seen = await support_alerts.recorded_at(db, f"checkout_seen:{session_id}")
    except Exception:
        logger.exception("Could not record pending checkout %s", session_id)
        return CheckoutPendingResponse(status="waiting")
    candidates = [t for t in (started, seen) if t is not None]
    first = min(candidates) if candidates else datetime.now(timezone.utc)
    waited = int((datetime.now(timezone.utc) - first).total_seconds())
    if waited < support_alerts.CHECKOUT_STUCK_AFTER_SECONDS:
        return CheckoutPendingResponse(status="waiting")

    if await support_alerts.record_once(db, "checkout_stuck", f"checkout_stuck:{session_id}", org_slug=org.slug):
        support_alerts.send_owner_email(
            f"BuboMap alert: paid checkout not applied after 5 minutes ({org.slug})",
            support_alerts.checkout_stuck_rows(org.slug, session_id, ctx.user.email, waited),
            reply_to=ctx.user.email,
        )
    return CheckoutPendingResponse(status="alerted")
