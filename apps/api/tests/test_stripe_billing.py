"""Stripe phase 1: price mapping, checkout params, webhook signature, idempotency, each event."""
import asyncio
import hashlib
import hmac
import json
import time
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import settings
from app.services import plan_apply
from app.services import stripe_billing as sb

TEST_KEY = "sk_test_unit"  # dummy; never a real key


def run(coro):
    return asyncio.run(coro)


def make_org(slug="qa-sso-test", plan="free", customer=None, subscription=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="QA SSO Test",
        slug=slug,
        plan=plan,
        stripe_customer_id=customer,
        stripe_subscription_id=subscription,
    )


def price(plan="team", interval="monthly", currency="usd", lookup=True, metadata=None):
    return {
        "id": f"price_{plan}_{interval}",
        "currency": currency,
        "lookup_key": f"bubomap_{plan}_{interval}" if lookup else None,
        "recurring": {"interval": "month" if interval == "monthly" else "year"},
        "metadata": metadata if metadata is not None else {"plan": plan, "licences": "5"},
    }


def subscription(sub_id="sub_1", status="active", plan="team", interval="monthly", customer="cus_1", org_id=None):
    return {
        "id": sub_id,
        "object": "subscription",
        "status": status,
        "customer": customer,
        "metadata": {"org_id": str(org_id)} if org_id else {},
        "items": {"data": [{"price": price(plan, interval)}]},
    }


def event(event_type, obj, event_id=None, livemode=False):
    return {
        "id": event_id or f"evt_{uuid.uuid4().hex[:10]}",
        "type": event_type,
        "livemode": livemode,
        "data": {"object": obj},
    }


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", TEST_KEY)
    monkeypatch.setattr(settings, "stripe_test_org_slugs", "qa-sso-test, other-test")
    monkeypatch.setattr(settings, "stripe_automatic_tax", False)
    monkeypatch.setattr(settings, "web_app_url", "https://app.example.com/")
    # Paid plans open to all so the checkout tests exercise checkout itself; the coming-soon gate
    # has its own tests (test_paid_coming_soon.py).
    monkeypatch.setattr(settings, "stripe_checkout_org_slugs", "")
    monkeypatch.setattr(settings, "stripe_checkout_open", "1")


class Store:
    """In-memory stand-in for the org table, audit_log and Stripe subscription retrieval."""

    def __init__(self, monkeypatch, orgs, stripe_subs=None):
        self.orgs = {o.id: o for o in orgs}
        self.audit = []
        self.applied = []
        self.commits = 0
        self.stripe_subs = stripe_subs or {}
        self.db = SimpleNamespace(commit=self._commit)

        async def org_by_id(db, raw):
            try:
                return self.orgs.get(uuid.UUID(str(raw)))
            except (TypeError, ValueError):
                return None

        async def org_by_subscription(db, sub_id):
            return next((o for o in self.orgs.values() if sub_id and o.stripe_subscription_id == sub_id), None)

        async def set_rls(db, org_id):
            return None

        async def event_seen(db, org_id, event_id):
            return any(
                a["org_id"] == org_id and a["action"] == sb.EVENT_AUDIT_ACTION and a["metadata"]["event_id"] == event_id
                for a in self.audit
            )

        async def log_audit(db, **kwargs):
            self.audit.append(kwargs)

        async def apply_plan(db, org_id, plan, **kwargs):
            org = self.orgs[org_id]
            org.plan = plan
            if kwargs.get("stripe_customer_id"):
                org.stripe_customer_id = kwargs["stripe_customer_id"]
            if kwargs.get("stripe_subscription_id"):
                org.stripe_subscription_id = kwargs["stripe_subscription_id"]
            if kwargs.get("clear_stripe"):
                org.stripe_subscription_id = None
            self.applied.append((plan, kwargs))
            return org

        monkeypatch.setattr(sb, "_org_by_id", org_by_id)
        monkeypatch.setattr(sb, "_org_by_subscription", org_by_subscription)
        monkeypatch.setattr(sb, "_set_rls", set_rls)
        monkeypatch.setattr(sb, "_event_seen", event_seen)
        monkeypatch.setattr(sb, "log_audit", log_audit)
        monkeypatch.setattr(sb, "apply_plan_to_org", apply_plan)
        monkeypatch.setattr(sb, "_fetch_subscription", lambda sub_id: self.stripe_subs.get(sub_id))

        self.locks = []

        async def lock_org(db, org):
            self.locks.append(org.id)
            return org

        monkeypatch.setattr(sb, "_lock_org", lock_org)

    async def _commit(self):
        self.commits += 1

    def handle(self, evt):
        return run(sb.handle_stripe_event(self.db, evt))

    def actions(self):
        return [a["action"] for a in self.audit]


# ── price → plan ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("plan", ["starter", "team", "business"])
@pytest.mark.parametrize("interval", ["monthly", "yearly"])
def test_price_maps_by_lookup_key(plan, interval):
    licences = {"starter": 1, "team": 5, "business": 10}[plan]
    assert sb.plan_for_price(price(plan, interval)) == (plan, interval, licences)


def test_price_falls_back_to_metadata_when_no_lookup_key():
    assert sb.plan_for_price(price("business", "yearly", lookup=False, metadata={"plan": "business"})) == (
        "business",
        "yearly",
        10,
    )


def test_licences_come_from_the_catalogue_not_price_metadata():
    assert sb.plan_for_price(price("team", metadata={"plan": "team", "licences": "99"}))[2] == 5


@pytest.mark.parametrize(
    "bad",
    [
        price("team", currency="cad"),
        price("team", lookup=False, metadata={}),
        price("team", lookup=False, metadata={"plan": "free"}),
        {"currency": "usd", "lookup_key": "something_else", "recurring": {"interval": "week"}, "metadata": {}},
        None,
    ],
)
def test_unknown_or_non_usd_prices_map_to_nothing(bad):
    assert sb.plan_for_price(bad) is None


# ── configuration / safety switches ─────────────────────────────────────────


def test_everything_off_without_secret_key(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    org = make_org()
    assert not sb.stripe_configured()
    assert not sb.checkout_available(org)
    with pytest.raises(HTTPException) as caught:
        sb._require_ready(org)
    assert caught.value.status_code == 503


def test_test_key_only_touches_allow_listed_orgs(configured):
    assert sb.checkout_available(make_org("qa-sso-test"))
    assert sb.checkout_available(make_org("OTHER-TEST"))
    assert not sb.checkout_available(make_org("real-customer"))
    with pytest.raises(HTTPException) as caught:
        sb._require_ready(make_org("real-customer"))
    assert caught.value.status_code == 403


def test_live_key_allows_every_org(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_live_unit")
    monkeypatch.setattr(settings, "stripe_test_org_slugs", "")
    assert sb.stripe_livemode()
    assert sb.checkout_available(make_org("real-customer"))


# ── checkout params ─────────────────────────────────────────────────────────


def test_checkout_params(configured):
    org = make_org()
    user_id = uuid.uuid4()
    params = sb.build_checkout_params(
        org,
        customer_id="cus_1",
        price_id="price_team_monthly",
        plan="team",
        interval="monthly",
        user_id=user_id,
        automatic_tax=False,
    )
    assert params["mode"] == "subscription"
    assert params["customer"] == "cus_1"
    assert params["client_reference_id"] == str(org.id)
    assert params["line_items"] == [{"price": "price_team_monthly", "quantity": 1}]
    assert params["metadata"]["org_id"] == str(org.id)
    assert params["metadata"]["plan"] == "team"
    assert params["metadata"]["interval"] == "monthly"
    assert params["subscription_data"]["metadata"]["org_id"] == str(org.id)
    assert params["success_url"] == (
        "https://app.example.com/orgs/qa-sso-test/settings?tab=billing&checkout=success"
        "&session_id={CHECKOUT_SESSION_ID}"
    )
    assert params["cancel_url"] == "https://app.example.com/orgs/qa-sso-test/settings?tab=billing&checkout=cancelled"
    assert "automatic_tax" not in params


def test_automatic_tax_is_a_switch(configured, monkeypatch):
    params = sb.build_checkout_params(
        make_org(), customer_id="cus_1", price_id="p", plan="starter", interval="yearly",
        user_id="u", automatic_tax=True,
    )
    assert params["automatic_tax"] == {"enabled": True}
    assert params["billing_address_collection"] == "required"
    assert params["customer_update"] == {"address": "auto", "name": "auto"}
    monkeypatch.setattr(settings, "stripe_automatic_tax", True)
    assert sb.automatic_tax_enabled()


class _FakeStripe:
    def __init__(self, prices, subscriptions=None, open_sessions=None):
        self.created_sessions = []
        self.created_customers = []
        self.expired_sessions = []
        self.subscriptions = subscriptions or []  # what Subscription.list returns for any customer
        self.open_sessions = open_sessions or []
        outer = self

        class Subscription:
            @staticmethod
            def list(customer, status, limit):
                assert status == "all"
                return SimpleNamespace(data=[s for s in outer.subscriptions if s.get("customer") == customer])

        class Price:
            @staticmethod
            def list(lookup_keys, active, limit):
                return SimpleNamespace(data=[p for p in prices if p["lookup_key"] in lookup_keys])

        class Customer:
            @staticmethod
            def create(**kwargs):
                outer.created_customers.append(kwargs)
                return SimpleNamespace(id="cus_new")

            @staticmethod
            def retrieve(cid):
                return SimpleNamespace(id=cid, deleted=False)

        class Session:
            @staticmethod
            def create(**kwargs):
                outer.created_sessions.append(kwargs)
                return SimpleNamespace(id="cs_test_1", url="https://checkout.stripe.com/c/pay/cs_test_1")

            @staticmethod
            def list(customer, status, limit):
                return SimpleNamespace(data=[SimpleNamespace(id=i) for i in outer.open_sessions])

            @staticmethod
            def expire(session_id):
                outer.expired_sessions.append(session_id)

        self.Subscription = Subscription
        self.Price = Price
        self.Customer = Customer
        self.checkout = SimpleNamespace(Session=Session)
        self.error = SimpleNamespace(InvalidRequestError=Exception)


def _catalogue_prices():
    out = []
    for plan, (m, y) in {"starter": (9900, 99000), "team": (44900, 449000), "business": (79900, 799000)}.items():
        for interval, amount in (("monthly", m), ("yearly", y)):
            p = price(plan, interval)
            p.update(id=f"price_{plan}_{interval}", unit_amount=amount)
            out.append(p)
    return out


def test_create_checkout_session_resolves_price_and_creates_customer(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    monkeypatch.setattr(sb, "_stripe", lambda: fake)
    monkeypatch.setattr(sb, "_price_cache", {})
    audits = []

    async def log_audit(db, **kw):
        audits.append(kw)

    monkeypatch.setattr(sb, "log_audit", log_audit)

    async def flush():
        return None

    db = SimpleNamespace(flush=flush)
    org = make_org()
    url, session_id = run(
        sb.create_checkout_session(
            db, org, plan="team", interval="yearly", user_email="owner@example.com",
            user_id=uuid.uuid4(), licences_in_use=3,
        )
    )
    assert url.startswith("https://checkout.stripe.com/")
    assert session_id == "cs_test_1"
    assert org.stripe_customer_id == "cus_new"
    assert fake.created_customers[0]["metadata"]["org_id"] == str(org.id)
    sent = fake.created_sessions[0]
    assert sent["line_items"] == [{"price": "price_team_yearly", "quantity": 1}]
    assert sent["customer"] == "cus_new"
    assert audits[0]["action"] == "billing.checkout_started"


def test_checkout_reuses_existing_customer(configured, monkeypatch):
    fake = _FakeStripe(_catalogue_prices())
    monkeypatch.setattr(sb, "_stripe", lambda: fake)
    monkeypatch.setattr(sb, "_price_cache", {})

    async def noop(*a, **k):
        return None

    monkeypatch.setattr(sb, "log_audit", noop)
    org = make_org(customer="cus_existing")
    run(sb.create_checkout_session(
        SimpleNamespace(flush=noop), org, plan="starter", interval="monthly",
        user_email="o@example.com", user_id=uuid.uuid4(), licences_in_use=1,
    ))
    assert fake.created_customers == []
    assert fake.created_sessions[0]["customer"] == "cus_existing"


def test_checkout_refuses_price_that_does_not_match_catalogue(configured, monkeypatch):
    prices = _catalogue_prices()
    prices[0]["unit_amount"] = 100  # starter monthly tampered
    monkeypatch.setattr(sb, "_stripe", lambda: _FakeStripe(prices))
    monkeypatch.setattr(sb, "_price_cache", {})
    with pytest.raises(HTTPException) as caught:
        sb.resolve_price_id("starter", "monthly")
    assert caught.value.status_code == 503


@pytest.mark.parametrize(
    "org_kwargs,plan,used,code",
    [
        ({"subscription": "sub_existing"}, "team", 1, 409),
        ({}, "starter", 3, 409),
        ({"slug": "real-customer"}, "team", 1, 403),
    ],
)
def test_checkout_guards(configured, org_kwargs, plan, used, code):
    with pytest.raises(HTTPException) as caught:
        run(sb.create_checkout_session(
            None, make_org(**org_kwargs), plan=plan, interval="monthly",
            user_email="o@example.com", user_id=uuid.uuid4(), licences_in_use=used,
        ))
    assert caught.value.status_code == code


# ── webhook signature ───────────────────────────────────────────────────────


def _signed(payload: bytes, secret: str, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def test_signature_valid_and_parsed_to_plain_dict():
    payload = json.dumps(event("invoice.paid", {"id": "in_1"}, "evt_sig")).encode()
    parsed = sb.verify_webhook(payload, _signed(payload, "whsec_unit"), "whsec_unit")
    assert parsed["id"] == "evt_sig"
    assert type(parsed) is dict


@pytest.mark.parametrize(
    "header",
    [
        lambda p: _signed(p, "whsec_wrong"),
        lambda p: _signed(p, "whsec_unit", ts=int(time.time()) - 3600),
        lambda p: "",
        lambda p: "t=1,v1=deadbeef",
    ],
)
def test_signature_rejected(header):
    payload = json.dumps(event("invoice.paid", {"id": "in_1"})).encode()
    with pytest.raises(Exception):
        sb.verify_webhook(payload, header(payload), "whsec_unit")


def test_webhook_route_returns_400_on_bad_signature(monkeypatch):
    from app.routers import webhooks

    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_unit")

    class _Req:
        headers = {"stripe-signature": "t=1,v1=bad"}

        async def body(self):
            return b"{}"

    with pytest.raises(HTTPException) as caught:
        run(webhooks.stripe_webhook(_Req(), db=None))
    assert caught.value.status_code == 400


def test_webhook_route_503_without_secret(monkeypatch):
    from app.routers import webhooks

    monkeypatch.setattr(settings, "stripe_webhook_secret", "")

    class _Req:
        headers = {}

        async def body(self):
            return b"{}"

    with pytest.raises(HTTPException) as caught:
        run(webhooks.stripe_webhook(_Req(), db=None))
    assert caught.value.status_code == 503


# ── webhook events ──────────────────────────────────────────────────────────


def test_checkout_completed_upgrades_to_team(configured, monkeypatch):
    org = make_org(customer="cus_1")
    store = Store(monkeypatch, [org], {"sub_1": subscription("sub_1", plan="team", org_id=org.id)})
    session = {
        "id": "cs_1", "mode": "subscription", "status": "complete", "customer": "cus_1",
        "subscription": "sub_1", "client_reference_id": str(org.id), "metadata": {"org_id": str(org.id)},
    }
    assert store.handle(event("checkout.session.completed", session)) == "synced:team:monthly"
    assert org.plan == "team"
    assert org.stripe_subscription_id == "sub_1"
    assert store.applied[0][1]["stripe_managed"] is True
    assert "billing.plan_changed" in store.actions()
    assert store.commits == 1


def test_checkout_completed_for_wrong_customer_is_ignored(configured, monkeypatch):
    org = make_org(customer="cus_mine")
    store = Store(monkeypatch, [org], {"sub_1": subscription("sub_1")})
    session = {"mode": "subscription", "status": "complete", "customer": "cus_other",
               "subscription": "sub_1", "metadata": {"org_id": str(org.id)}}
    assert store.handle(event("checkout.session.completed", session)) == "ignored:org_not_found"
    assert org.plan == "free" and store.applied == []


def test_subscription_created_before_checkout_links_through_metadata_and_customer(configured, monkeypatch):
    org = make_org(customer="cus_1")
    sub = subscription("sub_9", plan="starter", org_id=org.id)
    store = Store(monkeypatch, [org], {"sub_9": sub})
    assert store.handle(event("customer.subscription.created", sub)) == "synced:starter:monthly"
    assert org.plan == "starter" and org.stripe_subscription_id == "sub_9"


def test_subscription_with_foreign_customer_cannot_claim_an_org(configured, monkeypatch):
    org = make_org(customer="cus_1")
    sub = subscription("sub_evil", customer="cus_evil", org_id=org.id)
    store = Store(monkeypatch, [org], {"sub_evil": sub})
    assert store.handle(event("customer.subscription.created", sub)) == "ignored:org_not_found"
    assert org.plan == "free"


def test_subscription_updated_switches_to_business(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", plan="business", interval="yearly")
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.updated", sub)) == "synced:business:yearly"
    assert org.plan == "business"
    changed = [a for a in store.audit if a["action"] == "billing.plan_changed"][0]
    assert changed["metadata"]["from"] == "team" and changed["metadata"]["licences"] == 10


def test_out_of_order_update_uses_latest_state_from_stripe(configured, monkeypatch):
    org = make_org(plan="business", customer="cus_1", subscription="sub_1")
    stale_payload = subscription("sub_1", plan="team")
    store = Store(monkeypatch, [org], {"sub_1": subscription("sub_1", plan="business")})
    assert store.handle(event("customer.subscription.updated", stale_payload)) == "synced:business:monthly"
    assert org.plan == "business"


def test_cancel_at_period_end_keeps_plan_until_deleted(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", plan="team")
    sub["cancel_at_period_end"] = True
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.updated", sub)).startswith("synced:team")
    assert org.plan == "team"


def test_subscription_deleted_downgrades_paid_org_to_free(configured, monkeypatch):
    """The old handler returned early for business orgs and never downgraded."""
    org = make_org(plan="business", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", status="canceled", plan="business")
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.deleted", sub)) == "downgraded:free"
    assert org.plan == "free"
    assert org.stripe_subscription_id is None
    assert org.stripe_customer_id == "cus_1"  # kept for resubscribing
    plan, kwargs = store.applied[0]
    assert plan == "free" and kwargs["clear_stripe"] is True
    assert "billing.plan_downgraded" in store.actions()


def test_subscription_deleted_never_touches_legacy_business(configured, monkeypatch):
    legacy = make_org(plan="business", customer="cus_1", subscription=None)
    sub = subscription("sub_old", status="canceled", org_id=legacy.id)
    store = Store(monkeypatch, [legacy], {"sub_old": sub})
    assert store.handle(event("customer.subscription.deleted", sub)) == "ignored:not_current_subscription"
    assert legacy.plan == "business" and store.applied == []


def test_deleted_event_for_other_subscription_is_ignored(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_current")
    old = subscription("sub_old", status="canceled", org_id=org.id)
    store = Store(monkeypatch, [org], {"sub_old": old})
    assert store.handle(event("customer.subscription.deleted", old)) == "ignored:org_not_found"
    assert org.plan == "team"


@pytest.mark.parametrize("status_", ["unpaid", "incomplete_expired"])
def test_ended_statuses_downgrade(configured, monkeypatch, status_):
    org = make_org(plan="starter", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", status=status_, plan="starter")
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.updated", sub)) == "downgraded:free"


def test_incomplete_subscription_does_not_upgrade(configured, monkeypatch):
    org = make_org(customer="cus_1")
    sub = subscription("sub_1", status="incomplete", org_id=org.id)
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.created", sub)) == "ignored:status_incomplete"
    assert org.plan == "free"


def test_past_due_keeps_plan(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", status="past_due")
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.updated", sub)) == "synced:team:monthly"


def test_unknown_price_is_ignored(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1")
    sub["items"]["data"][0]["price"] = price("team", currency="cad")
    store = Store(monkeypatch, [org], {"sub_1": sub})
    assert store.handle(event("customer.subscription.updated", sub)) == "ignored:unknown_price"
    assert org.plan == "team" and store.applied == []


def test_invoice_payment_failed_is_recorded_without_plan_change(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    store = Store(monkeypatch, [org])
    inv = {"id": "in_1", "subscription": "sub_1", "attempt_count": 1}
    assert store.handle(event("invoice.payment_failed", inv)) == "recorded:payment_failed"
    assert org.plan == "team" and store.applied == []
    assert "billing.payment_failed" in store.actions()


def test_invoice_paid_resyncs_using_new_payload_shape(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    store = Store(monkeypatch, [org], {"sub_1": subscription("sub_1", plan="team")})
    inv = {"id": "in_2", "amount_paid": 44900, "currency": "usd",
           "parent": {"subscription_details": {"subscription": "sub_1"}}}
    assert store.handle(event("invoice.paid", inv)) == "paid:synced:team:monthly"
    assert "billing.invoice_paid" in store.actions()


def test_duplicate_event_is_processed_once(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    sub = subscription("sub_1", status="canceled")
    store = Store(monkeypatch, [org], {"sub_1": sub})
    evt = event("customer.subscription.deleted", sub, event_id="evt_same")
    assert store.handle(evt) == "downgraded:free"
    org.stripe_subscription_id = "sub_1"  # even if state were restored, the replay must not act
    assert store.handle(evt) == "duplicate"
    assert len(store.applied) == 1
    assert store.actions().count(sb.EVENT_AUDIT_ACTION) == 1


def test_livemode_mismatch_is_ignored(configured, monkeypatch):
    org = make_org(plan="team", customer="cus_1", subscription="sub_1")
    store = Store(monkeypatch, [org], {"sub_1": subscription("sub_1", status="canceled")})
    out = store.handle(event("customer.subscription.deleted", subscription("sub_1", status="canceled"), livemode=True))
    assert out == "ignored:livemode_mismatch"
    assert org.plan == "team"


def test_test_key_ignores_orgs_not_on_the_allow_list(configured, monkeypatch):
    org = make_org(slug="real-customer", plan="team", customer="cus_1", subscription="sub_1")
    store = Store(monkeypatch, [org], {"sub_1": subscription("sub_1", status="canceled")})
    out = store.handle(event("customer.subscription.deleted", subscription("sub_1", status="canceled")))
    assert out == "ignored:org_not_allowed"
    assert org.plan == "team" and store.audit == []


def test_unhandled_event_types_are_ignored(configured, monkeypatch):
    store = Store(monkeypatch, [])
    assert store.handle(event("customer.created", {"id": "cus_1"})) == "ignored:unhandled"


def test_missing_subscription_raises_retryable_and_records_nothing(configured, monkeypatch):
    org = make_org(customer="cus_1")
    store = Store(monkeypatch, [org], {})
    session = {"mode": "subscription", "status": "complete", "customer": "cus_1",
               "subscription": "sub_x", "metadata": {"org_id": str(org.id)}}
    with pytest.raises(sb.StripeRetryableError):
        store.handle(event("checkout.session.completed", session))
    assert store.audit == [] and store.commits == 0


# ── apply_plan_to_org writes the licence cap ────────────────────────────────


class _Rows:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _ApplyDb:
    def __init__(self, org):
        self.org = org
        self.added = []
        self.calls = 0

    async def execute(self, stmt):
        self.calls += 1
        return _Rows(self.org if self.calls == 1 else None)

    def add(self, row):
        self.added.append(row)

    async def flush(self):
        return None


def test_apply_pack_writes_licence_cap_and_keeps_stripe_ids():
    org = make_org(customer="cus_1")
    db = _ApplyDb(org)
    run(plan_apply.apply_plan_to_org(db, org.id, "team", stripe_subscription_id="sub_1", stripe_managed=True))
    limits = {r.limit_key: r.value for r in db.added}
    assert org.plan == "team" and org.stripe_subscription_id == "sub_1"
    assert limits["max_editor_seats"] == 5
    assert limits["max_members"] is None


def test_apply_free_after_cancel_caps_at_one_editor_and_clears_subscription():
    org = make_org(plan="business", customer="cus_1", subscription="sub_1")
    db = _ApplyDb(org)
    run(plan_apply.apply_plan_to_org(db, org.id, "free", clear_stripe=True, stripe_managed=True))
    limits = {r.limit_key: r.value for r in db.added}
    assert org.plan == "free" and org.stripe_subscription_id is None and org.stripe_customer_id == "cus_1"
    assert limits["max_editor_seats"] == 1
    assert limits["max_workspaces"] == 1


def test_apply_business_by_hand_stays_legacy():
    org = make_org()
    db = _ApplyDb(org)
    run(plan_apply.apply_plan_to_org(db, org.id, "business", contributors=15))
    limits = {r.limit_key: r.value for r in db.added}
    assert org.plan == "business"
    assert limits["max_members"] == 15
    assert limits["max_editor_seats"] is None


class _SignedReq:
    def __init__(self, payload: bytes, header: str):
        self._payload = payload
        self.headers = {"stripe-signature": header}

    async def body(self):
        return self._payload


def test_webhook_route_verifies_raw_body_then_handles(monkeypatch):
    from app.routers import webhooks

    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_unit")
    seen = []

    async def fake_handle(db, evt):
        seen.append(evt["id"])
        return "synced:team:monthly"

    monkeypatch.setattr(webhooks, "handle_stripe_event", fake_handle)
    payload = json.dumps(event("customer.subscription.updated", {"id": "sub_1"}, "evt_route")).encode()
    out = run(webhooks.stripe_webhook(_SignedReq(payload, _signed(payload, "whsec_unit")), db=None))
    assert out == {"status": "ok", "outcome": "synced:team:monthly"}
    assert seen == ["evt_route"]


def test_webhook_route_asks_stripe_to_retry(monkeypatch):
    from app.routers import webhooks

    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_unit")

    async def fake_handle(db, evt):
        raise sb.StripeRetryableError("later")

    rolled_back = []

    async def rollback():
        rolled_back.append(True)

    monkeypatch.setattr(webhooks, "handle_stripe_event", fake_handle)
    payload = json.dumps(event("checkout.session.completed", {"id": "cs_1"})).encode()
    with pytest.raises(HTTPException) as caught:
        run(webhooks.stripe_webhook(_SignedReq(payload, _signed(payload, "whsec_unit")), db=SimpleNamespace(rollback=rollback)))
    assert caught.value.status_code == 503
    assert rolled_back == [True]
