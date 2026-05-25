"""Firebase Admin helpers for auth action links (dev fallback only)."""
from firebase_admin import auth as firebase_auth

from app.auth import _ensure_firebase
from app.config import settings


def generate_verification_link(email: str) -> str:
    _ensure_firebase()
    continue_url = f"{settings.web_app_url.rstrip('/')}/auth/verify-email"
    action_settings = firebase_auth.ActionCodeSettings(
        url=continue_url,
        handle_code_in_app=False,
    )
    return firebase_auth.generate_email_verification_link(email, action_settings)
