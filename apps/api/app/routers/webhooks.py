"""Third-party webhook handlers."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.stripe_billing import handle_stripe_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe webhooks are not configured",
        )

    try:
        import stripe

        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
    except Exception as exc:
        logger.warning("Stripe webhook verification failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    await handle_stripe_event(db, event)
    return {"status": "ok"}
