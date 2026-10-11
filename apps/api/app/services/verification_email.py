"""Email verification — send via Resend with app-signed confirmation links."""
from __future__ import annotations

import logging

from app.config import settings
from app.services.email_sender import format_from_address, send_email
from app.services.email_verification_token import build_verification_url

logger = logging.getLogger(__name__)


def _verification_email_html(verify_url: str) -> str:
    return f"""
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Verify your email</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #4b5563;">
        Confirm your email address to unlock invites and other sensitive actions in BuboMap.
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


def _verification_email_text(verify_url: str) -> str:
    return (
        "Verify your email\n\n"
        "Confirm your email address to unlock invites and other sensitive actions in BuboMap.\n\n"
        f"Open this link to verify: {verify_url}\n"
    )


def send_verification_email(
    firebase_uid: str,
    email: str,
    *,
    app_origin: str | None = None,
) -> tuple[bool, str, str | None]:
    """
    Send a verification email. Returns (email_sent, user_message, optional_link).

    Uses app-signed links so delivery does not depend on Firebase outbound email APIs.
    """
    link = build_verification_url(firebase_uid, email, app_origin=app_origin)

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

    try:
        send_email(
            to=[email],
            subject="Verify your email",
            html_body=_verification_email_html(link),
            text_body=_verification_email_text(link),
        )
    except Exception:
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

    message = "Verification email sent. Check your inbox and spam folder."
    if settings.debug:
        return True, message, link
    return True, message, None


def _format_from_address(raw: str) -> str:  # kept for older imports
    return format_from_address(raw)
