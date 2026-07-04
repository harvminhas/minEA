"""Signed email-verification tokens — independent of Firebase outbound email rate limits."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.config import settings

_TOKEN_TTL_SECONDS = 60 * 60 * 24  # 24 hours


def _signing_secret() -> str:
    if settings.app_secret.strip():
        return settings.app_secret.strip()
    # Fallback: RESEND_API_KEY is already required to send mail; avoids a separate
    # production env var when APP_SECRET was not set during deploy.
    if settings.resend_api_key.strip():
        return settings.resend_api_key.strip()
    raise ValueError(
        "APP_SECRET is not configured. On the API server, set APP_SECRET to a long "
        "random string (recommended), or set RESEND_API_KEY so verification links can be signed."
    )


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_email_verification_token(firebase_uid: str, email: str) -> str:
    payload = {
        "uid": firebase_uid,
        "email": email.lower(),
        "exp": int(time.time()) + _TOKEN_TTL_SECONDS,
    }
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(_signing_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_email_verification_token(token: str) -> dict[str, Any]:
    try:
        body, sig = token.rsplit(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid verification link.") from exc

    expected = hmac.new(_signing_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise ValueError("Invalid verification link.")

    payload = json.loads(_b64url_decode(body))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("This verification link has expired. Request a new one.")

    uid = payload.get("uid")
    email = payload.get("email")
    if not uid or not email:
        raise ValueError("Invalid verification link.")

    return {"uid": str(uid), "email": str(email)}


def build_verification_url(firebase_uid: str, email: str, *, app_origin: str | None = None) -> str:
    base = (app_origin or settings.web_app_url).rstrip("/")
    token = create_email_verification_token(firebase_uid, email)
    return f"{base}/auth/verify-email?token={token}"
