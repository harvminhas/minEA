"""Shared sender: 'BuboMap - ' subjects, HTML + text parts, 'Submitted by' blocks."""
import asyncio
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks
from fastapi.security import HTTPAuthorizationCredentials

from app import auth as auth_mod
from app.auth import AuthContext
from app.config import settings
from app.routers import contact as contact_router
from app.routers import support as support_router
from app.schemas.contact import BusinessPlanRequestCreate
from app.schemas.support import SupportRequestCreate
from app.services import business_request_email as bre
from app.services import email_sender as es
from app.services import support_alerts as sa
from app.services import verification_email as ve

AT = datetime(2026, 10, 11, 20, 5, tzinfo=timezone.utc)  # 4:05 PM EDT


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Help request: Other (acme)", "BuboMap - Help request: Other (acme)"),
        ("BuboMap help request: Other (acme)", "BuboMap - Help request: Other (acme)"),
        ("BuboMap alert: Stripe webhook handler failed", "BuboMap - Alert: Stripe webhook handler failed"),
        ("BuboMap - Verify your email", "BuboMap - Verify your email"),
        ("BuboMap - BuboMap - x", "BuboMap - BuboMap - x"),  # only one lead is normalised
        ("Verify your email", "BuboMap - Verify your email"),
    ],
)
def test_brand_subject(raw, expected):
    assert es.brand_subject(raw) == expected
    assert es.brand_subject(es.brand_subject(raw)) == expected


def test_toronto_time():
    assert es.toronto_time(AT) == "Sun Oct 11, 2026, 4:05 PM EDT"
    assert es.toronto_time(datetime(2026, 12, 1, 17, 0, tzinfo=timezone.utc)).endswith("12:00 PM EST")


@pytest.fixture
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "business_request_notify_email", "owner@example.com")
    monkeypatch.setattr(settings, "support_notify_email", "")
    monkeypatch.setattr(es.resend.Emails, "send", lambda p: out.append(p))
    return out


def user(**kw):
    return SimpleNamespace(id=uuid.UUID(int=7), firebase_uid="fbUID123", email="ada@acme.example", full_name="Ada Lovelace", **kw)


ORG = SimpleNamespace(id=uuid.uuid4(), name="Acme Corp", slug="acme", plan="starter", stripe_subscription_id=None)


class FakeDb:
    def __init__(self, results=()):
        self.added, self.results = [], list(results)

    def add(self, o):
        self.added.append(o)

    async def commit(self):
        pass

    async def refresh(self, o):
        o.id = uuid.uuid4()
        o.created_at = AT

    async def execute(self, *_a, **_k):
        value = self.results.pop(0) if self.results else None
        return SimpleNamespace(scalar_one_or_none=lambda: value)


def run_tasks(bg):
    for t in bg.tasks:
        t.func(*t.args, **t.kwargs)


def test_help_request_email_identity_first_html_and_text(sent):
    ctx = SimpleNamespace(user=user(), org=ORG, org_role="member")
    bg = BackgroundTasks()
    asyncio.run(support_router.submit_support_request(SupportRequestCreate(topic="other", message="Hi <there>"), bg, ctx, FakeDb()))
    run_tasks(bg)
    (p,) = sent
    assert p["subject"] == "BuboMap - Help request: Other (acme)"
    assert p["reply_to"] == "ada@acme.example"
    h, t = p["html"], p["text"]
    assert h.index("Submitted by") < h.index("Details") < h.index("Hi &lt;there&gt;")
    for value in ("Ada Lovelace", "ada@acme.example", "fbUID123 (id 00000000-0000-0000-0000-000000000007)",
                  "Acme Corp (acme)", "Member", "Starter", "Sun Oct 11, 2026, 4:05 PM EDT"):
        assert value in h and value in t, value
    assert t.startswith("Help request: Other (acme)\n\nSUBMITTED BY\n")


def test_webhook_alert_says_who_and_is_prefixed(sent, monkeypatch):
    async def rec(*a, **k):
        return True

    monkeypatch.setattr(sa, "record_once", rec)
    assert asyncio.run(sa.alert_webhook_failure(None, "handler", error_type="KeyError", event_id="evt_1"))
    (p,) = sent
    assert p["subject"] == "BuboMap - Alert: Stripe webhook handler failed"
    assert "Stripe webhook (automatic alert, no user)" in p["text"]


def test_business_request_signed_out_shows_not_signed_in_with_form_fields(sent):
    body = BusinessPlanRequestCreate(name="Visitor", email="v@x.example", company="X Co", licences=6,
                                     billing_period="monthly", payment_method="card")
    bg = BackgroundTasks()
    asyncio.run(contact_router.submit_business_request(body, bg, FakeDb(), None))
    run_tasks(bg)
    (p,) = sent
    assert p["subject"] == "BuboMap - Business plan request: X Co (6 licences)"
    assert "Not signed in" in p["text"]
    for v in ("Name (form)", "Visitor", "Email (form)", "v@x.example", "Company (form)", "X Co"):
        assert v in p["text"]


def test_business_request_signed_in_uses_verified_identity_not_form(sent, monkeypatch):
    from app.services import tenancy

    async def membership(db, user_id, slug):
        return ORG, "owner"

    monkeypatch.setattr(tenancy, "_resolve_org_membership", membership)
    body = BusinessPlanRequestCreate(name="Someone Else", email="spoof@x.example", company="Acme Corp", licences=8,
                                     billing_period="annual", payment_method="invoice", org_slug="acme")
    bg = BackgroundTasks()
    auth = AuthContext(firebase_uid="fbUID123", email="ada@acme.example", email_verified=True)
    asyncio.run(contact_router.submit_business_request(body, bg, FakeDb([user()]), auth))
    run_tasks(bg)
    text = sent[0]["text"]
    who = text.split("DETAILS")[0]
    assert "Ada Lovelace" in who and "ada@acme.example" in who and "fbUID123" in who
    assert "Acme Corp (acme)" in who and "Owner" in who and "Starter" in who
    assert "spoof@x.example" not in who and "Not signed in" not in who


def test_optional_auth_ignores_bad_tokens(monkeypatch):
    async def bad(_):
        from fastapi import HTTPException
        raise HTTPException(401, "nope")

    monkeypatch.setattr(auth_mod, "get_auth_context", bad)
    assert asyncio.run(auth_mod.get_optional_auth_context(None)) is None
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="x")
    assert asyncio.run(auth_mod.get_optional_auth_context(creds)) is None


def test_verification_email_prefixed_with_text_part(sent):
    ok, _msg, _link = ve.send_verification_email("uid1", "ada@acme.example", app_origin="https://app.example")
    assert ok
    (p,) = sent
    assert p["subject"] == "BuboMap - Verify your email"
    assert p["text"].startswith("Verify your email") and "https://app.example" in p["text"]


def test_every_sender_goes_through_email_sender():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app"
    direct = [p.name for p in root.rglob("*.py") if "resend.Emails.send" in p.read_text() and p.name != "email_sender.py"]
    assert direct == []


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("minEA <onboarding@resend.dev>", "BuboMap <onboarding@resend.dev>"),
        ("noreply@bubomap.com", "BuboMap <noreply@bubomap.com>"),
        ("BuboMap <noreply@bubomap.com>", "BuboMap <noreply@bubomap.com>"),
    ],
)
def test_from_display_name_is_always_bubomap(raw, expected):
    assert es.format_from_address(raw) == expected


def test_no_minea_in_email_text(sent):
    ve.send_verification_email("uid1", "ada@acme.example", app_origin="https://app.example")
    (p,) = sent
    assert p["from"].startswith("BuboMap <")
    for part in (p["subject"], p["html"], p["text"]):
        assert "minEA" not in part
