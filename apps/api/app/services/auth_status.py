"""Authoritative email-verification status from Firebase Admin + Postgres.

Microsoft sign-in (decision, ms-signin):
Firebase never marks Microsoft emails verified (email_verified is false or missing), because an
Entra tenant admin can put any address on a user. We still treat a Microsoft account's email as
verified when Firebase itself supplies it AND it is the email of the Microsoft identity on that
Firebase account (provider_data["microsoft.com"].email == account email). That means:
- the email always comes from Firebase (token / Admin SDK), never from the client;
- a password account can't become "verified" by linking a Microsoft login with a different
  address (the provider email must equal the account email);
- password accounts are unchanged: they need Firebase email_verified or our own link;
- no email from Firebase means not verified (the account works; sensitive actions stay gated).
Existing accounts can't be claimed this way: with "one account per email" Firebase refuses a
Microsoft sign-in for an email that already has an account until the person signs in the old way.
Residual risk (accepted): a malicious tenant admin could create a brand-new BuboMap account with
an address they don't own. Joining someone else's org still needs the invite token from that
mailbox. Keep removeUnverifiedEmailClaim=true on the Entra app (the default for new apps).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from firebase_admin import auth as firebase_auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import MICROSOFT_PROVIDER, _ensure_firebase
from app.models.tenancy import User

logger = logging.getLogger(__name__)


def _uses_password_provider(fb_user: firebase_auth.UserRecord) -> bool:
    return any(p.provider_id == "password" for p in fb_user.provider_data)


def microsoft_email_verified(fb_user: firebase_auth.UserRecord) -> bool:
    """The account email is the email of its Microsoft identity, both as Firebase reports them."""
    email = (fb_user.email or "").strip().lower()
    if not email:
        return False
    return any(
        p.provider_id == MICROSOFT_PROVIDER and (p.email or "").strip().lower() == email
        for p in fb_user.provider_data
    )


async def microsoft_sign_in_verified(firebase_uid: str, token_email: str) -> bool:
    """For a microsoft.com sign-in: look the account up once and apply microsoft_email_verified.

    token_email must also match, so the address we store is the one we checked.
    """
    if not token_email:
        return False
    try:
        _ensure_firebase()
        fb_user = await asyncio.to_thread(firebase_auth.get_user, firebase_uid)
    except Exception as exc:  # Firebase down: not verified this time, retried on the next request
        logger.warning("Could not check Microsoft email for %s: %s", firebase_uid, exc)
        return False
    if (fb_user.email or "").strip().lower() != token_email.strip().lower():
        return False
    return microsoft_email_verified(fb_user)


def resolve_verification_status(
    fb_user: firebase_auth.UserRecord,
    db_user: User | None,
) -> dict[str, object]:
    """Email/password accounts must verify; Google is trusted by Firebase; Microsoft per the rule above."""
    providers = [p.provider_id for p in fb_user.provider_data]
    db_verified = db_user is not None and db_user.email_verified_at is not None
    email_verified = bool(fb_user.email_verified) or db_verified or microsoft_email_verified(fb_user)
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
