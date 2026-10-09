"""Production 500 on checkout (Vercel, test key): Stripe refused Session.create because the account
has Managed Payments and the app pinned API 2024-12-18.acacia. Now: basil pin, Stripe errors in
checkout/portal become 502 stripe_error, and expiring old sessions never blocks checkout."""
import asyncio
import logging
from types import SimpleNamespace

import pytest
import stripe
from fastapi import HTTPException

from app.services import stripe_billing as sb

from tests.test_stripe_billing import _catalogue_prices, _FakeStripe, configured, make_org  # noqa: F401
from tests.test_stripe_live_fix import _checkout, _use_stripe

MANAGED_PAYMENTS = (
    "Managed Payments is not supported on API version 2024-12-18.acacia. Update your API version, "
    "or set the API Version of this request to 2025-03-31.basil or greater."
)


def test_api_version_is_basil_or_newer(configured, monkeypatch):
    assert sb.API_VERSION >= "2025-03-31.basil"
    monkeypatch.setattr(stripe, "api_version", None)
    monkeypatch.setattr(stripe, "api_key", None)
    monkeypatch.setattr(stripe, "max_network_retries", 0)
    monkeypatch.setattr(stripe, "default_http_client", None)
    client = sb._stripe()
    assert client.api_version == sb.API_VERSION
    assert client.max_network_retries == 1
    assert client.default_http_client._timeout == sb.STRIPE_TIMEOUT_SECONDS


def _failing_create(fake, exc):
    def create(**kwargs):
        fake.created_sessions.append(kwargs)
        raise exc

    fake.checkout.Session.create = staticmethod(create)


def test_managed_payments_refusal_is_a_clean_502(configured, monkeypatch, caplog):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)
    _failing_create(fake, stripe.error.InvalidRequestError(MANAGED_PAYMENTS, param=None))
    with caplog.at_level(logging.ERROR, logger="app.services.stripe_billing"):
        with pytest.raises(HTTPException) as caught:
            _checkout(make_org())
    assert caught.value.status_code == 502
    assert caught.value.detail == {"code": "stripe_error", "message": sb.STRIPE_ERROR_MESSAGES["checkout"]}
    assert "Managed Payments is not supported" in caplog.text  # Stripe's message is logged
    assert "qa-sso-test" in caplog.text


@pytest.mark.parametrize(
    "where",
    ["price", "customer", "create"],
)
def test_any_stripe_failure_in_checkout_is_502(configured, monkeypatch, where):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)
    boom = stripe.error.APIConnectionError("Network error: read timed out")

    def raiser(*a, **k):
        raise boom

    if where == "price":
        fake.Price.list = staticmethod(raiser)
    elif where == "customer":
        fake.Customer.create = staticmethod(raiser)
    else:
        _failing_create(fake, boom)
    with pytest.raises(HTTPException) as caught:
        _checkout(make_org())
    assert caught.value.status_code == 502
    assert caught.value.detail["code"] == "stripe_error"


def test_non_stripe_http_errors_pass_through(configured, monkeypatch):
    fake = _FakeStripe([])  # price missing -> existing 503 "Pricing is not configured"
    _use_stripe(monkeypatch, fake)
    with pytest.raises(HTTPException) as caught:
        _checkout(make_org())
    assert caught.value.status_code == 503


def test_new_customer_skips_expiring_and_checkout_succeeds(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)
    url, _ = _checkout(make_org())  # no customer yet: created in this request
    assert url.startswith("https://checkout.stripe.com/")
    assert fake.session_lists == []  # nothing to expire on a brand-new customer


def test_expiring_failure_never_blocks_checkout(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)

    def broken_list(*a, **k):
        raise stripe.error.APIConnectionError("read timed out")

    fake.checkout.Session.list = staticmethod(broken_list)
    url, _ = _checkout(make_org(customer="cus_1"))
    assert url.startswith("https://checkout.stripe.com/")
    assert len(fake.created_sessions) == 1


def test_expiring_uses_no_retries(configured, monkeypatch):
    seen = []
    fake = _FakeStripe(_catalogue_prices(), open_sessions=["cs_old"])
    _use_stripe(monkeypatch, fake)
    original_list, original_expire = fake.checkout.Session.list, fake.checkout.Session.expire

    def list_(customer, status, limit, **opts):
        seen.append(("list", opts))
        return original_list(customer, status, limit)

    def expire(session_id, **opts):
        seen.append(("expire", opts))
        return original_expire(session_id)

    fake.checkout.Session.list = staticmethod(list_)
    fake.checkout.Session.expire = staticmethod(expire)
    _checkout(make_org(customer="cus_1"))
    assert seen == [("list", {"max_network_retries": 0}), ("expire", {"max_network_retries": 0})]


def test_portal_stripe_failure_is_502(configured, monkeypatch, caplog):
    def create(**kwargs):
        raise stripe.error.InvalidRequestError("No such customer: 'cus_gone'", param="customer")

    monkeypatch.setattr(
        sb, "_stripe", lambda: SimpleNamespace(billing_portal=SimpleNamespace(Session=SimpleNamespace(create=create)))
    )
    monkeypatch.setattr(sb, "resolve_portal_configuration", lambda variant: None)
    with caplog.at_level(logging.ERROR, logger="app.services.stripe_billing"):
        with pytest.raises(HTTPException) as caught:
            asyncio.run(sb.create_portal_session(make_org(plan="team", customer="cus_gone", subscription="sub_1"), licences_in_use=1))
    assert caught.value.status_code == 502
    assert caught.value.detail == {"code": "stripe_error", "message": sb.STRIPE_ERROR_MESSAGES["portal"]}
    assert "No such customer" in caplog.text


def test_portal_configuration_lookup_failure_is_502(configured, monkeypatch):
    def broken(variant):
        raise stripe.error.AuthenticationError("Invalid API Key provided")

    monkeypatch.setattr(sb, "resolve_portal_configuration", broken)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(sb.create_portal_session(make_org(plan="team", customer="cus_1", subscription="sub_1"), licences_in_use=1))
    assert caught.value.status_code == 502


@pytest.mark.parametrize(
    "invoice, expected",
    [
        ({"id": "in_1", "subscription": "sub_acacia"}, "sub_acacia"),  # acacia (current webhook endpoint)
        ({"id": "in_1", "subscription": {"id": "sub_expanded"}}, "sub_expanded"),
        (
            {"id": "in_1", "parent": {"type": "subscription_details", "subscription_details": {"subscription": "sub_basil"}}},
            "sub_basil",
        ),  # basil
        ({"id": "in_1", "parent": {"subscription_details": {"subscription": {"id": "sub_basil_x"}}}}, "sub_basil_x"),
        ({"id": "in_1", "parent": None}, None),
        ({"id": "in_1"}, None),
    ],
)
def test_invoice_subscription_id_both_shapes(invoice, expected):
    assert sb.invoice_subscription_id(invoice) == expected
