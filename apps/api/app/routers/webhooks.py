"""Third-party webhook handlers."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.stripe_billing import StripeRetryableError, handle_stripe_event, verify_webhook

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    try:
        outcome = await handle_stripe_event(db, event)
    except StripeRetryableError as exc:
        await db.rollback()
        logger.warning("Stripe event %s will be retried: %s", event.get("id"), exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Retry later")
    return {"status": "ok", "outcome": outcome}
