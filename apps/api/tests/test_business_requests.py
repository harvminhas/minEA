"""Business plan "Get started" requests: schema, endpoint, email notify, additive migration."""
import asyncio
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from app.config import settings
from app.main import app
from app.models.contact import BusinessPlanRequest
from app.routers import contact as contact_router
from app.schemas.contact import BusinessPlanRequestCreate
from app.services import business_request_email as bre

API = Path(__file__).resolve().parents[1]
MIGRATION = API / "migrations" / "046_business_plan_requests.sql"

GOOD = dict(
    name=" Ada ",
    email=" Ada@Example.com ",
    company=" Acme ",
    licences=8,
    billing_period="annual",
    payment_method="invoice",
    message="  ",
    org_slug="acme",
    source="pricing",
)


class FakeDb:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        obj.id = obj.id or uuid.uuid4()
        obj.created_at = datetime.now(timezone.utc)


def test_schema_requires_five_or_more_licences():
    BusinessPlanRequestCreate(**GOOD)
    BusinessPlanRequestCreate(**{**GOOD, "licences": 5})
    with pytest.raises(ValidationError):
        BusinessPlanRequestCreate(**{**GOOD, "licences": 4})


@pytest.mark.parametrize(
    "field,value",
    [("email", "nope"), ("billing_period", "weekly"), ("payment_method", "cheque"), ("name", ""), ("company", "")],
)
def test_schema_rejects_bad_fields(field, value):
    with pytest.raises(ValidationError):
        BusinessPlanRequestCreate(**{**GOOD, field: value})


def test_message_is_optional():
    body = {k: v for k, v in GOOD.items() if k not in ("message", "org_slug", "source")}
    BusinessPlanRequestCreate(**body)


def test_endpoint_stores_cleaned_request_and_queues_email():
    db = FakeDb()
    bg = BackgroundTasks()
    req = asyncio.run(contact_router.submit_business_request(BusinessPlanRequestCreate(**GOOD), bg, db))
    assert db.commits == 1 and db.added == [req]
    assert isinstance(req, BusinessPlanRequest)
    assert (req.name, req.email, req.company, req.licences) == ("Ada", "ada@example.com", "Acme", 8)
    assert (req.billing_period, req.payment_method) == ("annual", "invoice")
    assert req.message is None and req.org_slug == "acme" and req.source == "pricing"
    assert [t.func for t in bg.tasks] == [bre.send_business_request_email]


def test_route_is_public_post():
    routes = [r for r in app.routes if getattr(r, "path", "") == "/api/v1/contact/business"]
    assert len(routes) == 1 and "POST" in routes[0].methods
    # No auth dependency: signed-out visitors can submit.
    names = {d.call.__name__ for d in routes[0].dependant.dependencies}
    assert not any("auth" in n for n in names)


def _req():
    return SimpleNamespace(
        id=uuid.uuid4(), name="Ada", email="ada@example.com", company="Acme <b>", licences=8,
        billing_period="annual", payment_method="invoice", message=None, org_slug=None, source="pricing",
    )


def test_email_skipped_without_resend_key(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "")
    called = []
    monkeypatch.setattr(bre.resend.Emails, "send", lambda p: called.append(p))
    assert bre.send_business_request_email(_req()) is False
    assert called == []


def test_email_sent_with_existing_resend_sender(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "business_request_notify_email", "team@example.com")
    sent = []
    monkeypatch.setattr(bre.resend.Emails, "send", lambda p: sent.append(p))
    assert bre.send_business_request_email(_req()) is True
    (payload,) = sent
    assert payload["to"] == ["team@example.com"]
    assert payload["reply_to"] == "ada@example.com"
    assert "8 licences" in payload["subject"]
    assert "Acme &lt;b&gt;" in payload["html"]  # escaped


def test_email_failure_never_raises(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test")

    def boom(_):
        raise RuntimeError("down")

    monkeypatch.setattr(bre.resend.Emails, "send", boom)
    assert bre.send_business_request_email(_req()) is False


def test_migration_is_purely_additive():
    sql = MIGRATION.read_text()
    code = "\n".join(line.split("--", 1)[0] for line in sql.splitlines()).upper()
    for word in ("DROP", "ALTER", "UPDATE", "DELETE", "TRUNCATE", "INSERT", "RENAME", "GRANT"):
        assert not re.search(rf"\b{word}\b", code), word
    statements = [s.strip() for s in code.split(";") if s.strip()]
    assert len(statements) == 3
    assert statements[0].startswith("CREATE TABLE IF NOT EXISTS BUSINESS_PLAN_REQUESTS")
    assert all(s.startswith("CREATE INDEX IF NOT EXISTS") for s in statements[1:])


def test_migration_is_registered_last():
    src = (API / "scripts" / "migrate.py").read_text()
    block = src.split("MIGRATION_FILES = [", 1)[1].split("]", 1)[0]
    files = re.findall(r'"(\d{3}_[a-z0-9_]+\.sql)"', block)
    assert files[-1] == "046_business_plan_requests.sql"
    assert files.count("046_business_plan_requests.sql") == 1


def test_model_matches_migration_columns():
    sql = MIGRATION.read_text()
    for col in BusinessPlanRequest.__table__.columns:
        assert re.search(rf"^\s+{col.name}\s", sql, re.M), col.name
