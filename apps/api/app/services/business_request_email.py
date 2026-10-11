"""Email a stored Business "Get started" request to the team, via the shared sender (email_sender).

Best effort: the request is already stored; a missing key or a Resend error only logs.
"""
from __future__ import annotations

import logging

from app.config import settings
from app.services.email_sender import Submitter, render_owner_email, send_email

logger = logging.getLogger(__name__)


def business_request_lines(req) -> list[tuple[str, str]]:
    return [
        ("Name", req.name),
        ("Work email", req.email),
        ("Company", req.company),
        ("Licences", str(req.licences)),
        ("Billing", "Annual" if req.billing_period == "annual" else "Monthly"),
        ("Pay by", "Invoice" if req.payment_method == "invoice" else "Card"),
        ("Org (form)", req.org_slug or "-"),
        ("From", req.source or "-"),
        ("Message", req.message or "-"),
    ]


def send_business_request_email(req, submitter: Submitter | None = None) -> bool:
    to = settings.business_request_notify_email.strip()
    if not to or not settings.resend_api_key.strip():
        logger.info("Business request %s stored; email notification not configured", req.id)
        return False
    who = submitter or Submitter(
        signed_in=False,
        submitted_at=getattr(req, "created_at", None),
        form_fields=[("Name (form)", req.name), ("Email (form)", req.email), ("Company (form)", req.company)],
    )
    subject = f"Business plan request: {req.company} ({req.licences} licences)"
    html_body, text_body = render_owner_email(subject, who, business_request_lines(req))
    try:
        send_email(to=[to], subject=subject, html_body=html_body, text_body=text_body, reply_to=req.email)
    except Exception:
        logger.exception("Resend business request email failed for %s", req.id)
        return False
    return True
