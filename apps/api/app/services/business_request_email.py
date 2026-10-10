"""Email a stored Business "Get started" request to the team, via the existing Resend sender.

Best effort: the request is already stored; a missing key or a Resend error only logs.
"""
from __future__ import annotations

import html
import logging

import resend

from app.config import settings
from app.services.verification_email import _format_from_address

logger = logging.getLogger(__name__)


def business_request_lines(req) -> list[tuple[str, str]]:
    return [
        ("Name", req.name),
        ("Work email", req.email),
        ("Company", req.company),
        ("Licences", str(req.licences)),
        ("Billing", "Annual" if req.billing_period == "annual" else "Monthly"),
        ("Pay by", "Invoice" if req.payment_method == "invoice" else "Card"),
        ("Org", req.org_slug or "-"),
        ("From", req.source or "-"),
        ("Message", req.message or "-"),
    ]


def send_business_request_email(req) -> bool:
    to = settings.business_request_notify_email.strip()
    if not to or not settings.resend_api_key.strip():
        logger.info("Business request %s stored; email notification not configured", req.id)
        return False
    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0;color:#6b7280'>{html.escape(k)}</td>"
        f"<td style='padding:4px 0'>{html.escape(v)}</td></tr>"
        for k, v in business_request_lines(req)
    )
    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": _format_from_address(settings.email_from),
                "to": [to],
                "reply_to": req.email,
                "subject": f"Business plan request: {req.company} ({req.licences} licences)",
                "html": f"<div style='font-family:system-ui,sans-serif'><h2>New Business plan request</h2><table>{rows}</table></div>",
            }
        )
    except Exception:
        logger.exception("Resend business request email failed for %s", req.id)
        return False
    return True
