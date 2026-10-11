"""Third-party webhook handlers."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.stripe_billing import StripeRetryableError, handle_stripe_event, verify_webhook
from app.services.support_alerts import alert_webhook_failure

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Stripe → subscription sync. Verifies the signature on the raw body (STRIPE_WEBHOOK_SECRET)."""
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    secret = (settings.stripe_webhook_secret or "").strip()

    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe webhooks are not configured",
        )

    try:
        event = verify_webhook(body, sig, secret)
    except Exception as exc:
        logger.warning("Stripe webhook verification failed: %s", type(exc).__name__)
        await alert_webhook_failure(db, "signature", error_type=type(exc).__name__)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    try:
        outcome = await handle_stripe_event(db, event)
    except StripeRetryableError as exc:
        await db.rollback()
        logger.warning("Stripe event %s will be retried: %s", event.get("id"), exc)
        await alert_webhook_failure(
            db, "retryable", error_type=type(exc).__name__, event_type=event.get("type"), event_id=event.get("id")
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Retry later")
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Stripe event %s failed", event.get("id"))
        await alert_webhook_failure(
            db, "handler", error_type=type(exc).__name__, event_type=event.get("type"), event_id=event.get("id")
        )
        # 500 so Stripe retries the delivery.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Webhook handler failed")
    return {"status": "ok", "outcome": outcome}
