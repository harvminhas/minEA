"""Third-party webhook handlers."""
from fastapi import APIRouter, HTTPException, Request, status

from app.config import settings

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        import stripe
        stripe.api_key = settings.stripe_secret_key
        stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    return {"status": "ok"}
