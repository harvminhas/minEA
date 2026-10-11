"""Owner alerts and support emails, sent through the existing Resend sender.

- Help form requests (reply-to = the user).
- Stripe webhook failures, at most one email per error kind per 10 minutes.
- A paid checkout not reflected in the org's plan after 5 minutes, once per session.

Alerts are deduplicated through billing_alerts.dedupe_key (unique), so they hold across
serverless instances. Emails never include secrets, signatures, payloads or card data.
Every function here is best effort: an alert problem must never break the request it reports on.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.contact import BillingAlert
from app.services.email_sender import Submitter, render_owner_email, send_email

logger = logging.getLogger(__name__)

WEBHOOK_ALERT_WINDOW_SECONDS = 600
CHECKOUT_STUCK_AFTER_SECONDS = 300


def support_notify_address() -> str:
    return (settings.support_notify_email or "").strip() or (settings.business_request_notify_email or "").strip()


def send_owner_email(
    subject: str,
    rows: list[tuple[str, str]],
    *,
    reply_to: str | None = None,
    submitter: Submitter | None = None,
) -> bool:
    """Email the owner. The subject gets the 'BuboMap - ' prefix in email_sender; the body opens
    with who submitted it (server-side identity), then rows. Best effort: never raises."""
    to = support_notify_address()
    if not to or not (settings.resend_api_key or "").strip():
        logger.info("Owner email not sent (not configured): %s", subject)
        return False
    who = submitter or Submitter(signed_in=False, system="BuboMap (automatic alert)")
    html_body, text_body = render_owner_email(subject, who, rows)
    try:
        send_email(to=[to], subject=subject, html_body=html_body, text_body=text_body, reply_to=reply_to)
    except Exception:
        logger.exception("Owner email failed: %s", subject)
        return False
    return True


async def record_once(
    db: AsyncSession, kind: str, dedupe_key: str, *, org_slug: str | None = None, detail: str | None = None
) -> bool:
    """Insert an alert row unless dedupe_key exists. True = this call recorded it first."""
    stmt = (
        insert(BillingAlert)
        .values(kind=kind, dedupe_key=dedupe_key, org_slug=org_slug, detail=detail)
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
        .returning(BillingAlert.id)
    )
    result = await db.execute(stmt)
    inserted = result.scalar_one_or_none() is not None
    await db.commit()
    return inserted


async def recorded_at(db: AsyncSession, dedupe_key: str) -> datetime | None:
    result = await db.execute(select(BillingAlert.created_at).where(BillingAlert.dedupe_key == dedupe_key))
    return result.scalar_one_or_none()


def webhook_alert_key(kind: str, now: float | None = None) -> str:
    bucket = int((now if now is not None else time.time()) // WEBHOOK_ALERT_WINDOW_SECONDS)
    return f"webhook:{kind}:{bucket}"


async def alert_webhook_failure(
    db: AsyncSession,
    kind: str,
    *,
    error_type: str,
    event_type: str | None = None,
    event_id: str | None = None,
) -> bool:
    """kind: signature | handler | retryable. Emails at most once per kind per 10 minutes.

    The caller rolls back a failed transaction first.
    """
    try:
        detail = f"{error_type} {event_type or ''} {event_id or ''}".strip()
        if not await record_once(db, f"webhook_{kind}", webhook_alert_key(kind), detail=detail):
            return False
        titles = {
            "signature": "Stripe webhook signature check failed",
            "handler": "Stripe webhook handler failed",
            "retryable": "Stripe webhook will be retried",
        }
        return send_owner_email(
            f"Alert: {titles.get(kind, 'Stripe webhook problem')}",
            [
                ("What happened", titles.get(kind, kind)),
                ("Error type", error_type),
                ("Event type", event_type or "-"),
                ("Event id", event_id or "-"),
                ("Next step", "Check the API logs and Stripe Dashboard > Developers > Webhooks. "
                 "Further alerts of this kind are paused for 10 minutes."),
            ],
            submitter=Submitter(signed_in=False, system="Stripe webhook (automatic alert, no user)"),
        )
    except Exception:
        logger.exception("Could not record or send the webhook alert (%s)", kind)
        return False


def checkout_stuck_rows(org_slug: str, session_id: str, user_email: str, waited_seconds: int) -> list[tuple[str, str]]:
    return [
        ("Checkout session", session_id),
        ("Waiting", f"about {max(1, waited_seconds // 60)} minutes"),
        ("Next step", "Find the session in Stripe, check the webhook delivery, and set the plan if needed."),
    ]
