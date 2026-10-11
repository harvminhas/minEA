"""The one place the API sends email (Resend).

- Every subject gets the "BuboMap - " prefix exactly once (brand_subject).
- Every email carries an HTML part and a plain-text part.
- Owner notifications (help requests, Business requests, billing alerts) open with a
  "Submitted by" block built from the server-side identity, never from form input.
"""
from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import resend

from app.config import settings

logger = logging.getLogger(__name__)

SUBJECT_PREFIX = "BuboMap - "
OWNER_TZ = "America/Toronto"

_LEAD = re.compile(r"^\s*BuboMap\s*(?:-|:|–|—)?\s*", re.IGNORECASE)


def brand_subject(subject: str) -> str:
    """'Help request: x' / 'BuboMap help request: x' / 'BuboMap - x' → 'BuboMap - …' (once)."""
    rest = _LEAD.sub("", subject.strip(), count=1) if _LEAD.match(subject.strip()) else subject.strip()
    if rest[:1].islower():
        rest = rest[0].upper() + rest[1:]
    return f"{SUBJECT_PREFIX}{rest}"


FROM_NAME = "BuboMap"


def format_from_address(raw: str) -> str:
    """Always 'BuboMap <address>': keep EMAIL_FROM's address, force the display name."""
    value = raw.strip()
    if "<" in value and ">" in value:
        value = value[value.index("<") + 1 : value.index(">")].strip()
    return f"{FROM_NAME} <{value}>"


def send_email(*, to: list[str], subject: str, html_body: str, text_body: str, reply_to: str | None = None) -> None:
    """Send through Resend. Raises on failure; callers decide whether that matters."""
    payload: dict = {
        "from": format_from_address(settings.email_from),
        "to": to,
        "subject": brand_subject(subject),
        "html": html_body,
        "text": text_body,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    resend.api_key = settings.resend_api_key
    resend.Emails.send(payload)


# ── Who submitted it ──────────────────────────────────────────────────────────


def toronto_time(at: datetime | None = None) -> str:
    at = at or datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    try:
        from zoneinfo import ZoneInfo

        local = at.astimezone(ZoneInfo(OWNER_TZ))
        return local.strftime("%a %b %-d, %Y, %-I:%M %p ") + (local.tzname() or "ET")
    except Exception:  # no tz database on the host: fall back to UTC, labelled
        return at.astimezone(timezone.utc).strftime("%a %b %-d, %Y, %-I:%M %p UTC")


@dataclass
class Submitter:
    """Identity block for owner emails. Signed-in values come from the verified token/DB."""

    signed_in: bool
    name: str | None = None
    email: str | None = None
    user_ref: str | None = None
    org_name: str | None = None
    org_slug: str | None = None
    role: str | None = None
    plan: str | None = None
    submitted_at: datetime | None = None
    system: str | None = None
    form_fields: list[tuple[str, str]] = field(default_factory=list)

    def rows(self) -> list[tuple[str, str]]:
        when = ("Submitted", toronto_time(self.submitted_at))
        if self.system:
            return [("Submitted by", self.system), when]
        if not self.signed_in:
            return [("Submitted by", "Not signed in"), *self.form_fields, when]
        org = "-"
        if self.org_slug:
            org = f"{self.org_name} ({self.org_slug})" if self.org_name else self.org_slug
        return [
            ("Name", self.name or "-"),
            ("Email", self.email or "-"),
            ("User", self.user_ref or "-"),
            ("Org", org),
            ("Role", (self.role or "-").capitalize()),
            ("Plan", (self.plan or "-").capitalize()),
            when,
        ]


def submitter_for(user, org=None, role: str | None = None, at: datetime | None = None) -> Submitter:
    """From the authenticated User row (and the org context, if any)."""
    uid = getattr(user, "firebase_uid", None)
    uref = f"{uid} (id {user.id})" if uid else str(getattr(user, "id", "-"))
    return Submitter(
        signed_in=True,
        name=getattr(user, "full_name", None),
        email=user.email,
        user_ref=uref,
        org_name=getattr(org, "name", None),
        org_slug=getattr(org, "slug", None),
        role=role,
        plan=getattr(org, "plan", None),
        submitted_at=at,
    )


# ── Rendering ─────────────────────────────────────────────────────────────────


def _rows_html(rows: list[tuple[str, str]]) -> str:
    return "".join(
        "<tr>"
        f"<td style='padding:5px 16px 5px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap'>{html.escape(k)}</td>"
        f"<td style='padding:5px 0;color:#111827;font-size:13px;white-space:pre-wrap'>{html.escape(v)}</td>"
        "</tr>"
        for k, v in rows
    )


def _rows_text(rows: list[tuple[str, str]]) -> str:
    width = max((len(k) for k, _ in rows), default=0)
    return "\n".join(f"{k.ljust(width)}  {v}" for k, v in rows)


def render_owner_email(title: str, submitter: Submitter, details: list[tuple[str, str]]) -> tuple[str, str]:
    """(html, text) with the 'Submitted by' block first, then the details."""
    who = submitter.rows()
    html_body = f"""<!doctype html>
<html><body style="margin:0;background:#f5f3ff;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e9e6fb;border-radius:12px">
<tr><td style="padding:18px 24px;border-bottom:1px solid #f1effc">
  <div style="font-size:12px;font-weight:600;color:#5b4ce6;letter-spacing:.04em">BUBOMAP</div>
  <div style="margin-top:4px;font-size:18px;font-weight:700;color:#111827">{html.escape(title)}</div>
</td></tr>
<tr><td style="padding:16px 24px 4px">
  <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Submitted by</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#faf9ff;border:1px solid #eeebfd;border-radius:8px;padding:8px 12px">{_rows_html(who)}</table>
</td></tr>
<tr><td style="padding:16px 24px 20px">
  <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Details</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">{_rows_html(details)}</table>
</td></tr>
</table>
<div style="margin-top:12px;font-size:11px;color:#9ca3af">Sent by BuboMap to the owner notification address. Reply to answer the sender where a reply-to is set.</div>
</td></tr></table>
</body></html>"""
    text_body = f"{title}\n\nSUBMITTED BY\n{_rows_text(who)}\n\nDETAILS\n{_rows_text(details)}\n"
    return html_body, text_body
