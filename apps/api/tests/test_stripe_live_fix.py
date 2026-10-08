"""Live-test fix (patch 0004): after a portal plan switch the billing tab showed "Business (legacy)"
with checkout buttons. Covers the event replay, the status rules, the checkout hard guard and the
cancel -> re-subscribe path."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers.billing import display_plan
from app.services import stripe_billing as sb
from tests.test_stripe_billing import (  # noqa: F401  (configured is a fixture)
    Store,
    _catalogue_prices,
    _FakeStripe,
    configured,
    event,
    make_org,
    run,
    subscription,
)


@pytest.fixture(autouse=True)
def _fresh_cache(monkeypatch):
    monkeypatch.setattr(sb, "_open_subscription_cache", {})


def _status_view(org):
    """What GET /billing/status reports for plan display and checkout (router logic)."""
    has_subscription, live_plan = run(sb.subscription_state(org))
    return {
        "has_subscription": has_subscription,
        "display_plan": display_plan(
            org.plan, org.stripe_subscription_id, has_subscription=has_subscription, live_plan=live_plan
        ),
        "checkout_allowed": sb.checkout_available(org) and not has_subscription,
    }


def _checkout(org, plan="team", used=1):
    async def noop(*a, **k):
        return None

    return run(sb.create_checkout_session(
        SimpleNamespace(flush=noop), org, plan=plan, interval="monthly",
        user_email="owner@example.com", user_id=uuid.uuid4(), licences_in_use=used,
    ))


def _use_stripe(monkeypatch, fake, *, keep_audit=False):
    monkeypatch.setattr(sb, "_stripe", lambda: fake)
    monkeypatch.setattr(sb, "_price_cache", {})
    if keep_audit:  # a Store already records audit rows
        return

    async def noop(*a, **k):
        return None

    monkeypatch.setattr(sb, "log_audit", noop)


def _portal_switch_events(org_id, sub):
    """Order Stripe sent on 2026-10-08 19:20:27 UTC for the Team -> Business portal switch."""
    invoice = {
        "id": "in_switch", "object": "invoice", "billing_reason": "subscription_update",
        "customer": "cus_1", "subscription": "sub_1", "amount_paid": 34999, "status": "paid",
    }
    return [
        event("customer.subscription.updated", sub, "evt_sub_updated"),
        event("invoice.created", invoice, "evt_inv_created"),
        event("invoice.finalized", invoice, "evt_inv_finalized"),
        event("invoice.paid", invoice, "evt_inv_paid"),
        event("invoice.payment_succeeded", invoice, "evt_inv_succeeded"),
    ]


# ── 1. the live-test sequence ────────────────────────────────────────────────


def test_portal_switch_replay_never_reports_legacy_and_blocks_checkout(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", plan="business", org_id=org.id)
    store = Store(monkeypatch, [org], {"sub_1": sub})
    fake = _FakeStripe(_catalogue_prices(), subscriptions=[sub])
    _use_stripe(monkeypatch, fake, keep_audit=True)

    outcomes = [store.handle(e) for e in _portal_switch_events(org.id, sub)]
    assert outcomes == [
        "synced:business:monthly",
        "ignored:unhandled",
        "ignored:unhandled",
        "paid:synced:business:monthly",
        "ignored:unhandled",
    ]
    assert (org.plan, org.stripe_customer_id, org.stripe_subscription_id) == ("business", "cus_1", "sub_1")
    # Every handled event took the per-org lock.
    assert store.locks == [org.id, org.id]
    # After each webhook the status is the pack, never legacy, and checkout is off.
    assert _status_view(org) == {"has_subscription": True, "display_plan": "business", "checkout_allowed": False}
    with pytest.raises(HTTPException) as caught:
        _checkout(org)
    assert caught.value.status_code == 409
    assert caught.value.detail["code"] == "already_subscribed"
    assert fake.created_sessions == []


def test_status_is_right_before_the_webhook_lands(configured, monkeypatch):
    """Org row still shows the pre-checkout state; Stripe already has the subscription."""
    org = make_org(plan="business", customer="cus_1")  # was legacy Business, checkout just paid
    _use_stripe(monkeypatch, _FakeStripe(_catalogue_prices(), subscriptions=[subscription("sub_2", plan="team")]))
    assert _status_view(org) == {"has_subscription": True, "display_plan": "team", "checkout_allowed": False}


# ── 2. "legacy" and the checkout hard guard ──────────────────────────────────


def test_legacy_means_business_without_subscription_or_customer(configured, monkeypatch):
    _use_stripe(monkeypatch, _FakeStripe(_catalogue_prices()))
    assert _status_view(make_org(plan="business")) == {
        "has_subscription": False, "display_plan": "business_legacy", "checkout_allowed": True,
    }
    assert _status_view(make_org(plan="business", customer="cus_1", subscription="sub_1"))["display_plan"] == "business"


def test_legacy_org_with_abandoned_checkout_stays_legacy(configured, monkeypatch):
    """Customer exists (checkout started, never paid) and holds no open subscription."""
    _use_stripe(monkeypatch, _FakeStripe(_catalogue_prices(), subscriptions=[subscription("sub_x", status="incomplete_expired")]))
    assert _status_view(make_org(plan="business", customer="cus_1")) == {
        "has_subscription": False, "display_plan": "business_legacy", "checkout_allowed": True,
    }


def test_stripe_unreachable_is_never_legacy_and_never_offers_checkout(configured, monkeypatch):
    def boom(customer_id):
        raise sb.StripeLookupError("timeout")

    monkeypatch.setattr(sb, "_customer_open_subscription", boom)
    view = _status_view(make_org(plan="business", customer="cus_1"))
    assert view == {"has_subscription": True, "display_plan": "business", "checkout_allowed": False}


@pytest.mark.parametrize("status_", ["active", "trialing", "past_due"])
def test_checkout_refuses_when_stripe_has_an_open_subscription(configured, monkeypatch, status_):
    org = make_org(plan="business", customer="cus_1")  # row shows no subscription
    fake = _FakeStripe(_catalogue_prices(), subscriptions=[subscription("sub_live", status=status_)])
    _use_stripe(monkeypatch, fake)
    with pytest.raises(HTTPException) as caught:
        _checkout(org)
    assert caught.value.status_code == 409
    assert caught.value.detail["code"] == "already_subscribed"
    assert "Manage billing" in caught.value.detail["message"]
    assert fake.created_sessions == []


def test_checkout_refuses_when_the_org_row_has_a_subscription(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)
    with pytest.raises(HTTPException) as caught:
        _checkout(make_org(plan="team", customer="cus_1", subscription="sub_1"), plan="business")
    assert caught.value.status_code == 409 and caught.value.detail["code"] == "already_subscribed"
    assert fake.created_sessions == []


def test_checkout_fails_closed_when_stripe_cannot_be_asked(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)

    def boom(customer_id):
        raise sb.StripeLookupError("timeout")

    monkeypatch.setattr(sb, "_customer_open_subscription", boom)
    with pytest.raises(HTTPException) as caught:
        _checkout(make_org(customer="cus_1"))
    assert caught.value.status_code == 503
    assert fake.created_sessions == []


def test_checkout_asks_stripe_fresh_not_from_the_status_cache(configured, monkeypatch):
    org = make_org(customer="cus_1")
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)
    assert _status_view(org)["checkout_allowed"] is True  # caches "no subscription"
    fake.subscriptions.append(subscription("sub_new", plan="team"))  # paid in another tab
    with pytest.raises(HTTPException) as caught:
        _checkout(org)
    assert caught.value.status_code == 409


def test_new_checkout_expires_older_open_sessions(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices(), open_sessions=["cs_old_tab"])
    _use_stripe(monkeypatch, fake)
    _checkout(make_org(customer="cus_1"))
    assert fake.expired_sessions == ["cs_old_tab"]
    assert len(fake.created_sessions) == 1


def test_first_checkout_without_customer_skips_the_stripe_lookup(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    _use_stripe(monkeypatch, fake)

    def must_not_call(customer_id):
        raise AssertionError("no customer yet, nothing to look up")

    monkeypatch.setattr(sb, "_customer_open_subscription", must_not_call)
    _checkout(make_org())
    assert fake.created_sessions[0]["customer"] == "cus_new"


def test_linking_over_another_subscription_is_audited(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_old")
    store = Store(monkeypatch, [org], {"sub_new": subscription("sub_new", plan="business", org_id=org.id)})
    session = {"mode": "subscription", "status": "complete", "customer": "cus_1",
               "subscription": "sub_new", "metadata": {"org_id": str(org.id)}}
    store.handle(event("checkout.session.completed", session))
    dup = [a for a in store.audit if a["action"] == "billing.duplicate_subscription"]
    assert dup and dup[0]["metadata"] == {"previous_subscription_id": "sub_old", "subscription_id": "sub_new"}


def test_portal_returns_to_the_billing_tab_with_portal_return(configured, monkeypatch):
    sent = {}

    class Portal:
        @staticmethod
        def create(**kwargs):
            sent.update(kwargs)
            return SimpleNamespace(url="https://billing.stripe.com/p/session/x")

    fake = SimpleNamespace(billing_portal=SimpleNamespace(Session=Portal))
    monkeypatch.setattr(sb, "_stripe", lambda: fake)
    monkeypatch.setattr(sb, "resolve_portal_configuration", lambda variant: None)
    run(sb.create_portal_session(make_org(plan="team", customer="cus_1", subscription="sub_1"), licences_in_use=1))
    assert sent["return_url"] == "https://app.example.com/orgs/qa-sso-test/settings?tab=billing&portal=return"


# ── 3. cancellation -> Free -> re-subscribe ──────────────────────────────────


def test_cancel_then_resubscribe_through_checkout(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    canceled = subscription("sub_1", status="canceled", plan="team", org_id=org.id)
    store = Store(monkeypatch, [org], {"sub_1": canceled})

    # Deleted: Free, subscription id cleared, customer kept (reused by the next checkout).
    assert store.handle(event("customer.subscription.deleted", canceled, "evt_del")) == "downgraded:free"
    assert (org.plan, org.stripe_customer_id, org.stripe_subscription_id) == ("free", "cus_1", None)
    assert store.applied[-1][1]["clear_stripe"] is True

    fake = _FakeStripe(_catalogue_prices(), subscriptions=[canceled])
    _use_stripe(monkeypatch, fake, keep_audit=True)
    assert _status_view(org) == {"has_subscription": False, "display_plan": "free", "checkout_allowed": True}

    # Re-subscribe: the canceled subscription doesn't block, same customer is reused.
    url, _ = _checkout(org, plan="business")
    assert url.startswith("https://checkout.stripe.com/")
    assert fake.created_sessions[0]["customer"] == "cus_1"
    assert fake.created_customers == []

    new_sub = subscription("sub_2", plan="business", org_id=org.id)
    store.stripe_subs["sub_2"] = new_sub
    session = {"mode": "subscription", "status": "complete", "customer": "cus_1",
               "subscription": "sub_2", "metadata": {"org_id": str(org.id)}}
    assert store.handle(event("checkout.session.completed", session)) == "synced:business:monthly"
    assert (org.plan, org.stripe_subscription_id) == ("business", "sub_2")
    assert "billing.duplicate_subscription" not in store.actions()

    # A late event about the old subscription can't undo the new one.
    assert store.handle(event("customer.subscription.deleted", canceled, "evt_del_retry")) == "ignored:org_not_found"
    assert store.handle(event("customer.subscription.updated", canceled, "evt_old_upd")) == "ignored:org_not_found"
    assert (org.plan, org.stripe_subscription_id) == ("business", "sub_2")
