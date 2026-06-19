"""Email verification — generate links (Firebase Admin) and send via Resend."""
from __future__ import annotations

import logging

import resend
from firebase_admin import auth as firebase_auth

from app.auth import _ensure_firebase
from app.config import settings

logger = logging.getLogger(__name__)


def generate_verification_link(email: str) -> str:
    _ensure_firebase()
    continue_url = f"{settings.web_app_url.rstrip('/')}/auth/verify-email"
    action_settings = firebase_auth.ActionCodeSettings(
        url=continue_url,
        handle_code_in_app=False,
    )
    return firebase_auth.generate_email_verification_link(email, action_settings)


def _verification_email_html(verify_url: str) -> str:
    return f"""
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Verify your email</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #4b5563;">
        Confirm your email address to unlock invites and other sensitive actions in minEA.
      </p>
      <p style="margin: 24px 0;">
        <a href="{verify_url}"
           style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none;
                  padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          Verify email
        </a>
      </p>
      <p style="font-size: 12px; color: #9ca3af; line-height: 1.5;">
        If the button does not work, copy this link into your browser:<br />
        <a href="{verify_url}" style="color: #4f46e5; word-break: break-all;">{verify_url}</a>
      </p>
    </div>
    """


def send_verification_email(email: str) -> tuple[bool, str, str | None]:
    """
    Send a verification email. Returns (email_sent, user_message, optional_link).

    When Resend is configured, sends branded mail from minEA.
    When Resend is not configured (local dev), returns the link for in-app display.
    """
    link = generate_verification_link(email)

    if not settings.resend_api_key.strip():
        if settings.debug:
            return (
                False,
                "Email delivery is not configured for local dev. Use the verification link below.",
                link,
            )
        logger.error("RESEND_API_KEY is not set — cannot send verification email")
        return (
            False,
            "We could not send the verification email right now. Please try again in a few minutes.",
            None,
        )

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": [email],
                "subject": "Verify your minEA email",
                "html": _verification_email_html(link),
            }
        )
    except Exception as exc:
        logger.exception("Resend verification email failed for %s", email)
        if settings.debug:
            return (
                False,
                "Could not send email via Resend. Use the verification link below instead.",
                link,
            )
        return (
            False,
            "We could not send the verification email right now. Please try again in a few minutes.",
            None,
        )

    return (
        True,
        "Verification email sent. Check your inbox and spam folder.",
        None,
    )
