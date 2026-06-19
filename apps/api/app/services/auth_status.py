"""Authoritative email-verification status from Firebase Admin + Postgres."""
from __future__ import annotations

from datetime import datetime

from firebase_admin import auth as firebase_auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import _ensure_firebase
from app.models.tenancy import User


def _uses_password_provider(fb_user: firebase_auth.UserRecord) -> bool:
    return any(p.provider_id == "password" for p in fb_user.provider_data)


def resolve_verification_status(
    fb_user: firebase_auth.UserRecord,
    db_user: User | None,
) -> dict[str, object]:
    """Email/password accounts must verify; Google (etc.) is trusted by Firebase."""
    providers = [p.provider_id for p in fb_user.provider_data]
    db_verified = db_user is not None and db_user.email_verified_at is not None
    email_verified = bool(fb_user.email_verified) or db_verified
    requires_email_verification = _uses_password_provider(fb_user) and not email_verified
    verified_at: datetime | None = db_user.email_verified_at if db_user else None
    return {
        "email": fb_user.email or (db_user.email if db_user else ""),
        "email_verified": email_verified,
        "requires_email_verification": requires_email_verification,
        "providers": providers,
        "email_verified_at": verified_at,
    }


async def get_auth_status(db: AsyncSession, firebase_uid: str) -> dict[str, object]:
    _ensure_firebase()
    fb_user = firebase_auth.get_user(firebase_uid)
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    db_user = result.scalar_one_or_none()
    return resolve_verification_status(fb_user, db_user)
