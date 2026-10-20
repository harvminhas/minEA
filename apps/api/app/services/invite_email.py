"""The invite email: org, who invited them, the workspaces and roles, an Accept button, 7-day expiry.

Best effort: the invite already exists. Without RESEND_API_KEY, or when Resend fails, this returns
False and the admin copies the link instead (the UI says so).
"""
from __future__ import annotations

import html
import logging

from app.config import settings
from app.services.email_sender import send_email

logger = logging.getLogger(__name__)

ROLE_LABEL = {"viewer": "Viewer", "member": "Member", "admin": "Admin"}


def invite_subject(org_name: str, inviter: str) -> str:
    return f"{inviter} invited you to {org_name}"


def render_invite_email(
    *, org_name: str, inviter: str, workspaces: list[dict], org_admin: bool, url: str, days: int = 7
) -> tuple[str, str]:
    """(html, text)."""
    if org_admin:
        access = [("All workspaces", "Org admin")]
    else:
        access = [(w["name"], ROLE_LABEL.get(w["role"], w["role"])) for w in workspaces]
    rows_html = "".join(
        "<tr>"
        f"<td style='padding:9px 12px;border-top:1px solid #f1effc;font-size:14px;color:#111827'>{html.escape(name)}</td>"
        f"<td align='right' style='padding:9px 12px;border-top:1px solid #f1effc;font-size:12px;color:#4b5563'>{html.escape(role)}</td>"
        "</tr>"
        for name, role in access
    )
    org = html.escape(org_name)
    who = html.escape(inviter)
    html_body = f"""<!doctype html>
<html><body style="margin:0;background:#f5f3ff;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e9e6fb;border-radius:12px">
<tr><td style="padding:24px 28px 8px">
  <div style="font-size:12px;font-weight:600;color:#5b4ce6;letter-spacing:.04em">BUBOMAP</div>
  <div style="margin-top:10px;font-size:20px;font-weight:700;color:#111827">Join {org} on BuboMap</div>
  <div style="margin-top:6px;font-size:14px;color:#4b5563;line-height:1.5">{who} invited you to {org}.</div>
</td></tr>
<tr><td style="padding:12px 28px 4px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #eeebfd;border-radius:8px;border-collapse:separate">
    <tr><td colspan="2" style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;text-transform:uppercase">Your access</td></tr>
    {rows_html}
  </table>
</td></tr>
<tr><td style="padding:20px 28px 8px">
  <a href="{html.escape(url, quote=True)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">Accept invite</a>
</td></tr>
<tr><td style="padding:8px 28px 24px;font-size:12px;color:#6b7280;line-height:1.5">
  This link works for {days} days and only for this email address. If the button doesn't work, paste this into your browser:<br>
  <a href="{html.escape(url, quote=True)}" style="color:#4f46e5;word-break:break-all">{html.escape(url)}</a>
</td></tr>
</table>
<div style="margin-top:12px;font-size:11px;color:#9ca3af">Not expecting this? You can ignore it; nothing happens unless you accept.</div>
</td></tr></table>
</body></html>"""
    lines = "\n".join(f"- {name}: {role}" for name, role in access)
    text_body = (
        f"{inviter} invited you to {org_name} on BuboMap.\n\nYour access:\n{lines}\n\n"
        f"Accept: {url}\n\nThe link works for {days} days and only for this email address.\n"
    )
    return html_body, text_body


def send_invite_email(
    *, to: str, org_name: str, inviter: str, workspaces: list[dict], org_admin: bool, url: str, reply_to: str | None = None
) -> bool:
    if not settings.resend_api_key.strip():
        logger.info("Invite for %s created; email not sent (RESEND_API_KEY not set)", to)
        return False
    html_body, text_body = render_invite_email(
        org_name=org_name, inviter=inviter, workspaces=workspaces, org_admin=org_admin, url=url
    )
    try:
        send_email(to=[to], subject=invite_subject(org_name, inviter), html_body=html_body, text_body=text_body, reply_to=reply_to)
    except Exception:
        logger.exception("Resend invite email failed for %s", to)
        return False
    return True
