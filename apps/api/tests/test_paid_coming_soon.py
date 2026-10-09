"""Paid plans "coming soon" gate: STRIPE_CHECKOUT_ORG_SLUGS / STRIPE_CHECKOUT_OPEN.

Checkout is allowed for orgs in the allowlist; for everyone only when STRIPE_CHECKOUT_OPEN=1 and
the allowlist is empty; for nobody by default. Others get 403 paid_plans_coming_soon, and billing
status reports paid_plans_available=false / checkout_allowed=false. The portal is untouched.
"""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers import billing as billing_router
from app.services import stripe_billing as sb

from tests.test_stripe_billing import TEST_KEY, _catalogue_prices, _FakeStripe, make_org, run

LIVE_KEY = "sk_live_unit"


@pytest.fixture
def stripe_on(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", TEST_KEY)
    monkeypatch.setattr(settings, "stripe_test_org_slugs", "harv-org, qa-sso-test")
    monkeypatch.setattr(settings, "stripe_automatic_tax", False)
    monkeypatch.setattr(settings, "web_app_url", "https://app.example.com/")
    monkeypatch.setattr(settings, "stripe_checkout_org_slugs", "")
    monkeypatch.setattr(settings, "stripe_checkout_open", "")


def gate(monkeypatch, slugs="", open_=""):
    monkeypatch.setattr(settings, "stripe_checkout_org_slugs", slugs)
    monkeypatch.setattr(settings, "stripe_checkout_open", open_)


# ── allowlist / open matrix ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "slugs, open_, slug, expected",
    [
        ("", "", "harv-org", False),  # default: closed to everyone
        ("", "", "acme", False),
        ("", "0", "acme", False),
        ("", "true", "acme", False),  # only the exact value 1 opens
        ("", "1", "acme", True),  # opened to everyone
        ("", " 1 ", "acme", True),
        ("harv-org", "", "harv-org", True),  # allowlisted
        ("harv-org", "", "acme", False),
        (" Harv-Org , other ", "", "harv-org", True),  # trimmed, case-insensitive
        ("harv-org", "", "HARV-ORG", True),
        ("harv-org", "1", "acme", False),  # a non-empty allowlist always restricts, even with OPEN=1
        ("harv-org", "1", "harv-org", True),
        (" , ", "1", "acme", True),  # blank entries = empty allowlist
    ],
)
def test_paid_plans_open_for(monkeypatch, slugs, open_, slug, expected):
    gate(monkeypatch, slugs, open_)
    assert sb.paid_plans_open_for(make_org(slug=slug)) is expected


def test_paid_plans_available_also_needs_stripe_for_the_org(stripe_on, monkeypatch):
    gate(monkeypatch, open_="1")
    # Test key: STRIPE_TEST_ORG_SLUGS still applies on top (unchanged behaviour).
    assert sb.paid_plans_available(make_org(slug="harv-org")) is True
    assert sb.paid_plans_available(make_org(slug="acme")) is False
    # Live key: every org passes the key check, so the coming-soon gate decides alone.
    monkeypatch.setattr(settings, "stripe_secret_key", LIVE_KEY)
    assert sb.paid_plans_available(make_org(slug="acme")) is True
    gate(monkeypatch, slugs="harv-org")
    assert sb.paid_plans_available(make_org(slug="acme")) is False
    assert sb.paid_plans_available(make_org(slug="harv-org")) is True
    # No key at all: nothing is available.
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    assert sb.paid_plans_available(make_org(slug="harv-org")) is False


# ── checkout endpoint ───────────────────────────────────────────────────────


def _checkout(org, monkeypatch, plan="team"):
    fake = _FakeStripe(_catalogue_prices())
    monkeypatch.setattr(sb, "_stripe", lambda: fake)
    monkeypatch.setattr(sb, "_price_cache", {})

    async def noop(*a, **k):
        return None

    monkeypatch.setattr(sb, "log_audit", noop)
    result = run(sb.create_checkout_session(
        SimpleNamespace(flush=noop), org, plan=plan, interval="monthly",
        user_email="o@example.com", user_id=uuid.uuid4(), licences_in_use=1,
    ))
    return result, fake


@pytest.mark.parametrize("slugs, open_", [("", ""), ("harv-org", ""), ("harv-org", "1")])
@pytest.mark.parametrize("plan", ["starter", "team", "business"])
def test_checkout_403_paid_plans_coming_soon(stripe_on, monkeypatch, slugs, open_, plan):
    gate(monkeypatch, slugs, open_)
    org = make_org(slug="qa-sso-test")  # allowed by the test key, not by the coming-soon gate
    with pytest.raises(HTTPException) as caught:
        _checkout(org, monkeypatch, plan)
    assert caught.value.status_code == 403
    assert caught.value.detail["code"] == "paid_plans_coming_soon"
    assert org.stripe_customer_id is None  # refused before any Stripe call


def test_checkout_403_with_live_key_by_default(stripe_on, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", LIVE_KEY)
    with pytest.raises(HTTPException) as caught:
        _checkout(make_org(slug="acme"), monkeypatch)
    assert caught.value.status_code == 403
    assert caught.value.detail["code"] == "paid_plans_coming_soon"


def test_allowlisted_org_gets_real_checkout(stripe_on, monkeypatch):
    gate(monkeypatch, slugs="harv-org")
    (url, session_id), fake = _checkout(make_org(slug="harv-org"), monkeypatch)
    assert url.startswith("https://checkout.stripe.com/")
    assert fake.created_sessions[0]["line_items"] == [{"price": "price_team_monthly", "quantity": 1}]


def test_open_to_everyone_gives_real_checkout(stripe_on, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", LIVE_KEY)
    gate(monkeypatch, open_="1")
    (url, _), _ = _checkout(make_org(slug="acme"), monkeypatch)
    assert url.startswith("https://checkout.stripe.com/")


def test_test_key_allowlist_still_applies_when_open(stripe_on, monkeypatch):
    gate(monkeypatch, slugs="acme")  # in the coming-soon allowlist but not in STRIPE_TEST_ORG_SLUGS
    with pytest.raises(HTTPException) as caught:
        _checkout(make_org(slug="acme"), monkeypatch)
    assert caught.value.status_code == 403
    assert caught.value.detail == "Self-serve billing is not enabled for this organization yet."


def test_subscribed_org_keeps_portal_while_closed(stripe_on, monkeypatch):
    gate(monkeypatch)  # closed to everyone
    sent = {}

    class Portal:
        @staticmethod
        def create(**kwargs):
            sent.update(kwargs)
            return SimpleNamespace(url="https://billing.stripe.com/p/session/x")

    monkeypatch.setattr(sb, "_stripe", lambda: SimpleNamespace(billing_portal=SimpleNamespace(Session=Portal)))
    monkeypatch.setattr(sb, "resolve_portal_configuration", lambda variant: None)
    url = run(sb.create_portal_session(
        make_org(slug="qa-sso-test", plan="team", customer="cus_1", subscription="sub_1"), licences_in_use=1
    ))
    assert url.startswith("https://billing.stripe.com/")
    assert sent["customer"] == "cus_1"


# ── billing status ──────────────────────────────────────────────────────────


class _DB:
    async def execute(self, *a, **k):
        return SimpleNamespace(scalar_one=lambda: 0)


def _status(org, monkeypatch):
    async def none(*a, **k):
        return None

    async def usage(*a, **k):
        return SimpleNamespace(used=1)

    monkeypatch.setattr(billing_router, "get_org_limit", none)
    monkeypatch.setattr(billing_router, "load_usage", usage)
    monkeypatch.setattr(billing_router, "licence_cap", none)
    monkeypatch.setattr(billing_router, "can_manage_billing", lambda ctx: True)
    ctx = SimpleNamespace(org=org, org_id=org.id)
    return run(billing_router.billing_status(ctx=ctx, db=_DB()))


def test_status_closed_by_default(stripe_on, monkeypatch):
    s = _status(make_org(slug="qa-sso-test"), monkeypatch)
    assert s.checkout_available is True  # Stripe is set up for this org...
    assert s.paid_plans_available is False  # ...but paid plans are coming soon
    assert s.checkout_allowed is False
    assert s.has_subscription is False


def test_status_allowlisted_org(stripe_on, monkeypatch):
    gate(monkeypatch, slugs="harv-org")
    s = _status(make_org(slug="harv-org"), monkeypatch)
    assert s.paid_plans_available is True
    assert s.checkout_allowed is True
    other = _status(make_org(slug="qa-sso-test"), monkeypatch)
    assert other.paid_plans_available is False
    assert other.checkout_allowed is False


def test_status_open_to_everyone(stripe_on, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", LIVE_KEY)
    gate(monkeypatch, open_="1")
    s = _status(make_org(slug="acme"), monkeypatch)
    assert s.paid_plans_available is True
    assert s.checkout_allowed is True


def test_status_subscribed_org_still_manages_billing_while_closed(stripe_on, monkeypatch):
    s = _status(make_org(slug="qa-sso-test", plan="team", customer="cus_1", subscription="sub_1"), monkeypatch)
    assert s.has_subscription is True
    assert s.has_billing_account is True
    assert s.checkout_allowed is False
    assert s.paid_plans_available is False
    assert s.display_plan == "team"


def test_status_without_stripe(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    gate(monkeypatch, open_="1")
    s = _status(make_org(slug="acme"), monkeypatch)
    assert s.paid_plans_available is False
    assert s.checkout_allowed is False
    assert s.stripe_configured is False
