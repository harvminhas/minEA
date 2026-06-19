"""Confirm email verification from app-signed tokens."""
from __future__ import annotations

import logging

from firebase_admin import auth as firebase_auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import _ensure_firebase
from app.models.tenancy import User
from app.services.email_verification_token import verify_email_verification_token
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


async def confirm_email_verification(db: AsyncSession, token: str) -> str:
    """Mark the user verified in Firebase and Postgres. Returns a user-facing message."""
    payload = verify_email_verification_token(token)
    uid = payload["uid"]
    email = payload["email"]

    _ensure_firebase()
    try:
        firebase_auth.update_user(uid, email_verified=True)
    except firebase_auth.UserNotFoundError as exc:
        raise ValueError("Account not found. Sign up again or contact support.") from exc
    except Exception:
        logger.exception("Firebase update_user failed for uid=%s", uid)
        raise ValueError("Could not verify email right now. Please try again.") from None

    result = await db.execute(select(User).where(User.firebase_uid == uid))
    user = result.scalar_one_or_none()
    if user:
        if user.email.lower() != email:
            raise ValueError("This verification link does not match your account email.")
        if not user.email_verified_at:
            user.email_verified_at = utc_now()
            await db.commit()

    return "Email verified. You can return to minEA and continue."
