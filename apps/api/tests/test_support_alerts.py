"""Help form, owner alerts for webhook failures and stuck checkouts, migration 047."""
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError

from app.config import settings
from app.main import app
from app.models.contact import BillingAlert, SupportRequest
from app.routers import support as support_router
from app.routers import webhooks
from app.schemas.support import CheckoutPendingRequest, SupportRequestCreate
from app.services import stripe_billing as sb
from app.services import support_alerts as sa
from app.services import email_sender as es
from tests.test_stripe_billing import _SignedReq, _signed, event, make_org, run

API = Path(__file__).resolve().parents[1]
MIGRATION = API / "migrations" / "047_support_requests.sql"
SID = "cs_test_a1B2c3D4e5"


def ctx(org=None, email="owner@example.com"):
    return SimpleNamespace(org=org or make_org(), user=SimpleNamespace(email=email), org_role="member")


class FakeDb:
    def __init__(self):
        self.added, self.commits = [], 0

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        obj.id = uuid.uuid4()
        obj.created_at = datetime.now(timezone.utc)

    async def rollback(self):
        pass


@pytest.fixture
def mail(monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "business_request_notify_email", "biz@example.com")
    monkeypatch.setattr(settings, "support_notify_email", "")
    monkeypatch.setattr(es.resend.Emails, "send", lambda p: sent.append(p))
    return sent


@pytest.fixture
def alerts(monkeypatch):
    """In-memory billing_alerts: dedupe_key -> created_at."""
    rows: dict[str, datetime] = {}

    async def record_once(db, kind, key, *, org_slug=None, detail=None):
        if key in rows:
            return False
        rows[key] = datetime.now(timezone.utc)
        return True

    async def recorded_at(db, key):
        return rows.get(key)

    monkeypatch.setattr(sa, "record_once", record_once)
    monkeypatch.setattr(sa, "recorded_at", recorded_at)
    return rows


# ── notify address ───────────────────────────────────────────────────────────


def test_support_address_defaults_to_business_request_address(monkeypatch):
    monkeypatch.setattr(settings, "business_request_notify_email", "architect@bubomap.com")
    monkeypatch.setattr(settings, "support_notify_email", "")
    assert sa.support_notify_address() == "architect@bubomap.com"
    monkeypatch.setattr(settings, "support_notify_email", " help@example.com ")
    assert sa.support_notify_address() == "help@example.com"


def test_owner_email_skipped_without_resend(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "")
    assert sa.send_owner_email("x", [("a", "b")]) is False


# ── help form ────────────────────────────────────────────────────────────────


def test_support_schema():
    SupportRequestCreate(topic="billing", message="Help")
    for bad in ({"topic": "sales", "message": "x"}, {"topic": "bug", "message": ""}):
        with pytest.raises(ValidationError):
            SupportRequestCreate(**bad)


def test_support_request_stored_with_session_values_and_emailed_with_reply_to(mail):
    db, bg = FakeDb(), BackgroundTasks()
    body = SupportRequestCreate(topic="billing", message=" Paid but still Free <b> ", checkout_session_id=SID, source="checkout")
    req = run(support_router.submit_support_request(body, bg, ctx(email="ada@acme.example"), db))
    assert isinstance(req, SupportRequest) and db.added == [req] and db.commits == 1
    assert (req.org_slug, req.user_email, req.topic) == ("qa-sso-test", "ada@acme.example", "billing")
    assert req.message == "Paid but still Free <b>" and req.checkout_session_id == SID
    for task in bg.tasks:
        task.func(*task.args, **task.kwargs)
    (payload,) = mail
    assert payload["to"] == ["biz@example.com"] and payload["reply_to"] == "ada@acme.example"
    assert "Billing" in payload["subject"] and "qa-sso-test" in payload["subject"]
    assert "&lt;b&gt;" in payload["html"] and SID in payload["html"]


def test_support_request_drops_a_malformed_session_id():
    db, bg = FakeDb(), BackgroundTasks()
    req = run(support_router.submit_support_request(
        SupportRequestCreate(topic="bug", message="x", checkout_session_id="not a session"), bg, ctx(), db))
    assert req.checkout_session_id is None


def test_routes_registered_and_org_scoped():
    paths = {getattr(r, "path", "") for r in app.routes}
    assert "/api/v1/orgs/{org_slug}/support" in paths
    assert "/api/v1/orgs/{org_slug}/billing/checkout-pending" in paths


# ── stuck checkout (lazy check) ──────────────────────────────────────────────


def pending(org, monkeypatch, *, session=None, configured=True):
    monkeypatch.setattr(support_router, "stripe_configured", lambda: configured)
    monkeypatch.setattr(support_router, "retrieve_checkout_session", lambda sid: session)
    return run(support_router.report_checkout_pending(CheckoutPendingRequest(session_id=SID), ctx(org), db=FakeDb()))


def paid_session(org, minutes_ago):
    created = int((datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).timestamp())
    return {"id": SID, "status": "complete", "created": created, "metadata": {"org_id": str(org.id)}}


def test_pending_is_active_once_the_subscription_is_on_the_org(monkeypatch, alerts, mail):
    org = make_org(subscription="sub_1")
    assert pending(org, monkeypatch).status == "active"
    assert alerts == {} and mail == []


def test_pending_under_five_minutes_records_but_does_not_email(monkeypatch, alerts, mail):
    org = make_org()
    assert pending(org, monkeypatch, session=paid_session(org, 2)).status == "waiting"
    assert f"checkout_seen:{SID}" in alerts and mail == []


def test_pending_after_five_minutes_emails_once_per_session(monkeypatch, alerts, mail):
    org = make_org()
    s = paid_session(org, 7)
    assert pending(org, monkeypatch, session=s).status == "alerted"
    assert pending(org, monkeypatch, session=s).status == "alerted"
    assert len(mail) == 1
    assert "not applied after 5 minutes" in mail[0]["subject"] and SID in mail[0]["html"]
    assert f"checkout_stuck:{SID}" in alerts


def test_pending_without_stripe_uses_first_sighting(monkeypatch, alerts, mail):
    org = make_org()
    assert pending(org, monkeypatch, configured=False).status == "waiting"
    alerts[f"checkout_seen:{SID}"] -= timedelta(minutes=6)
    assert pending(org, monkeypatch, configured=False).status == "alerted"
    assert len(mail) == 1


def test_pending_rejects_another_orgs_session(monkeypatch, alerts):
    org = make_org()
    other = paid_session(make_org(), 9)
    with pytest.raises(HTTPException) as exc:
        pending(org, monkeypatch, session=other)
    assert exc.value.status_code == 404


def test_pending_unpaid_session_never_alerts(monkeypatch, alerts, mail):
    org = make_org()
    s = {**paid_session(org, 30), "status": "open"}
    assert pending(org, monkeypatch, session=s).status == "waiting"
    assert mail == []


def test_pending_validates_session_id():
    with pytest.raises(HTTPException):
        run(support_router.report_checkout_pending(CheckoutPendingRequest(session_id="../x"), ctx(), db=FakeDb()))


# ── webhook alerts ───────────────────────────────────────────────────────────


def test_webhook_alert_key_buckets_ten_minutes():
    assert sa.webhook_alert_key("handler", 6000) == sa.webhook_alert_key("handler", 6599)
    assert sa.webhook_alert_key("handler", 6000) != sa.webhook_alert_key("handler", 6600)
    assert sa.webhook_alert_key("handler", 6000) != sa.webhook_alert_key("signature", 6000)


def test_bad_signature_alerts_once_per_window_without_secrets(monkeypatch, alerts, mail):
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_supersecret")

    class _Req:
        headers = {"stripe-signature": "t=1,v1=deadbeefsig"}

        async def body(self):
            return b'{"card": "4242424242424242"}'

    for _ in range(3):
        with pytest.raises(HTTPException) as exc:
            run(webhooks.stripe_webhook(_Req(), db=FakeDb()))
        assert exc.value.status_code == 400
    assert len(mail) == 1
    text = json.dumps(mail[0])
    for secret in ("whsec_supersecret", "deadbeefsig", "4242", "re_test"):
        assert secret not in text
    assert "signature" in mail[0]["subject"]


def test_handler_crash_returns_500_and_alerts(monkeypatch, alerts, mail):
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_unit")

    async def boom(db, evt):
        raise KeyError("items")

    monkeypatch.setattr(webhooks, "handle_stripe_event", boom)
    payload = json.dumps(event("customer.subscription.updated", {"id": "sub_1"}, "evt_crash")).encode()
    for _ in range(2):
        with pytest.raises(HTTPException) as exc:
            run(webhooks.stripe_webhook(_SignedReq(payload, _signed(payload, "whsec_unit")), db=FakeDb()))
        assert exc.value.status_code == 500
    assert len(mail) == 1
    assert "evt_crash" in mail[0]["html"] and "KeyError" in mail[0]["html"]
    assert "customer.subscription.updated" in mail[0]["html"]


def test_alert_failure_never_breaks_the_webhook(monkeypatch, mail):
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_unit")

    async def broken(*a, **k):
        raise RuntimeError("table missing")

    monkeypatch.setattr(sa, "record_once", broken)

    class _Req:
        headers = {"stripe-signature": "bad"}

        async def body(self):
            return b"{}"

    with pytest.raises(HTTPException) as exc:
        run(webhooks.stripe_webhook(_Req(), db=FakeDb()))
    assert exc.value.status_code == 400
    assert mail == []


# ── migration 047 ────────────────────────────────────────────────────────────


def test_migration_047_is_purely_additive():
    sql = MIGRATION.read_text()
    code = "\n".join(line.split("--", 1)[0] for line in sql.splitlines()).upper()
    for word in ("DROP", "ALTER", "UPDATE", "DELETE", "TRUNCATE", "INSERT", "RENAME", "GRANT"):
        assert not re.search(rf"\b{word}\b", code), word
    statements = [s.strip() for s in code.split(";") if s.strip()]
    assert all(re.match(r"CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS", s) for s in statements), statements


def test_migration_047_registered_last():
    src = (API / "scripts" / "migrate.py").read_text()
    block = src.split("MIGRATION_FILES = [", 1)[1].split("]", 1)[0]
    files = re.findall(r'"(\d{3}_[a-z0-9_]+\.sql)"', block)
    assert "047_support_requests.sql" in files and files == sorted(files)


@pytest.mark.parametrize("model", [SupportRequest, BillingAlert])
def test_models_match_migration(model):
    sql = MIGRATION.read_text()
    assert f"CREATE TABLE IF NOT EXISTS {model.__tablename__}" in sql
    for col in model.__table__.columns:
        assert re.search(rf"^\s+{col.name}\s", sql, re.M), col.name
