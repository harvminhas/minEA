"""
Clerk & Stripe webhook handlers.
Clerk events keep our users/organisations tables in sync.
"""
import hashlib
import hmac
import json
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.objects import Organisation, User

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_clerk_signature(payload: bytes, svix_id: str, svix_timestamp: str, svix_signature: str) -> bool:
    if not settings.clerk_webhook_secret:
        return True  # Skip verification in dev
    signed_content = f"{svix_id}.{svix_timestamp}.{payload.decode()}"
    secret = settings.clerk_webhook_secret.replace("whsec_", "")
    import base64
    secret_bytes = base64.b64decode(secret)
    expected = hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    expected_b64 = base64.b64encode(expected).decode()
    for sig in svix_signature.split(" "):
        if sig.startswith("v1,") and hmac.compare_digest(sig[3:], expected_b64):
            return True
    return False


@router.post("/clerk")
async def clerk_webhook(request: Request) -> dict:
    body = await request.body()
    svix_id = request.headers.get("svix-id", "")
    svix_timestamp = request.headers.get("svix-timestamp", "")
    svix_signature = request.headers.get("svix-signature", "")

    if not _verify_clerk_signature(body, svix_id, svix_timestamp, svix_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    event = json.loads(body)
    event_type = event.get("type")
    data = event.get("data", {})

    async with AsyncSessionLocal() as db:
        if event_type == "organization.created":
            org = Organisation(
                id=uuid.uuid4(),
                name=data.get("name", ""),
                slug=data.get("slug", str(uuid.uuid4())[:8]),
                plan="free",
            )
            db.add(org)
            await db.commit()

        elif event_type in ("user.created", "user.updated"):
            clerk_id = data.get("id", "")
            email = (data.get("email_addresses") or [{}])[0].get("email_address", "")
            first = data.get("first_name", "") or ""
            last = data.get("last_name", "") or ""
            full_name = f"{first} {last}".strip() or None

            result = await db.execute(select(User).where(User.clerk_id == clerk_id))
            user = result.scalar_one_or_none()
            if user:
                user.email = email
                user.full_name = full_name
            else:
                db.add(User(clerk_id=clerk_id, email=email, full_name=full_name))
            await db.commit()

    return {"status": "ok"}


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
    # Stripe webhook handling — expand as billing is implemented
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        import stripe
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    # Handle subscription events here
    return {"status": "ok"}
