"""Stripe self-serve billing: Checkout, Customer Portal and subscription sync.

Active only when STRIPE_SECRET_KEY is set. Safety rules (PER-SEAT-PLAN §4.5):
- A TEST-mode key only touches orgs listed in STRIPE_TEST_ORG_SLUGS (dev and prod share one DB).
- Webhook events whose livemode differs from the key's mode are ignored.
- An event only changes an org whose stripe_subscription_id matches, or (when linking a new
  subscription) whose id is in the metadata we set at checkout and whose customer matches.
- Plan changes only rewrite org.plan and org_limits. Nothing deletes rows or rewrites roles;
  cancelling drops the org to Free and keeps all data.
- Handlers are idempotent: each processed event id is recorded in audit_log
  (action billing.stripe_event) and skipped on redelivery; subscription state is re-read from
  Stripe so out-of-order delivery converges on the latest state.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.tenancy import Org
from app.services.audit import log_audit
from app.services.plan_apply import apply_plan_to_org
from app.services.plan_features import normalize_plan
from app.services.plans import (
    CURRENCY,
    INTERVALS,
    PACK_ORDER,
    lookup_key_for,
    parse_lookup_key,
    plan_licences,
    portal_variant_for_licences,
    unit_amount_cents,
)

logger = logging.getLogger(__name__)

API_VERSION = "2024-12-18.acacia"  # pinned; matches stripe==11.4.1 and the webhook endpoint
EVENT_AUDIT_ACTION = "billing.stripe_event"

# Subscription statuses that keep the paid plan (past_due = retries still running, D11).
ACTIVE_STATUSES = frozenset({"active", "trialing", "past_due"})
# Statuses that end the paid plan -> Free (data kept).
ENDED_STATUSES = frozenset({"canceled", "unpaid", "incomplete_expired"})

HANDLED_EVENTS = frozenset(
    {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
    }
)

_price_cache: dict[str, str] = {}
_portal_cache: dict[str, str | None] = {}


# ── configuration ────────────────────────────────────────────────────────────


def stripe_secret_key() -> str:
    return (settings.stripe_secret_key or "").strip()


def stripe_configured() -> bool:
    """Server-side switch: everything Stripe is off unless the secret key is set."""
    return bool(stripe_secret_key())


def stripe_livemode() -> bool:
    return stripe_secret_key().startswith(("sk_live_", "rk_live_"))


def test_org_slugs() -> set[str]:
    raw = settings.stripe_test_org_slugs or ""
    return {s.strip().lower() for s in raw.split(",") if s.strip()}


def org_allowed(org: Org) -> bool:
    """With a test key, only allow-listed orgs; with a live key, every org."""
    if not stripe_configured():
        return False
    if stripe_livemode():
        return True
    return (org.slug or "").lower() in test_org_slugs()


def checkout_available(org: Org) -> bool:
    return stripe_configured() and org_allowed(org)


def checkout_org_slugs() -> set[str]:
    raw = settings.stripe_checkout_org_slugs or ""
    return {s.strip().lower() for s in raw.split(",") if s.strip()}


def checkout_open_to_all() -> bool:
    """STRIPE_CHECKOUT_OPEN=1 with no STRIPE_CHECKOUT_ORG_SLUGS: anyone may buy a pack."""
    return (settings.stripe_checkout_open or "").strip() == "1" and not checkout_org_slugs()


def paid_plans_open_for(org: Org) -> bool:
    """May this org START a new paid plan? (Coming-soon gate, independent of the Stripe key.)

    - STRIPE_CHECKOUT_ORG_SLUGS set: only those orgs (even if STRIPE_CHECKOUT_OPEN=1).
    - else STRIPE_CHECKOUT_OPEN=1: every org.
    - else (default): no org. Paid plans show "Coming soon".
    Orgs with a subscription keep the Customer Portal regardless; this only gates Checkout.
    """
    if checkout_open_to_all():
        return True
    return (org.slug or "").lower() in checkout_org_slugs()


def paid_plans_available(org: Org) -> bool:
    """Checkout can really start for this org: Stripe configured for it AND paid plans open to it."""
    return checkout_available(org) and paid_plans_open_for(org)


def automatic_tax_enabled() -> bool:
    return bool(settings.stripe_automatic_tax)


def _stripe():
    import stripe

    stripe.api_key = stripe_secret_key()
    stripe.api_version = API_VERSION
    stripe.max_network_retries = 2
    # The library default is an 80 s timeout per attempt. These calls run inside request handlers,
    # so bound them: a slow Stripe must never hold a webhook or a status request for minutes.
    if stripe.default_http_client is None:
        stripe.default_http_client = stripe.RequestsClient(timeout=20)
    return stripe


def _plain(obj: Any) -> Any:
    """StripeObject -> plain dict/list (they serialise to JSON via str())."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if type(obj) in (dict, list):
        return obj
    return json.loads(str(obj))


def _id(value: Any) -> str | None:
    """Stripe fields are either an id string or an expanded object."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("id")
    return None


def _require_ready(org: Org) -> None:
    if not stripe_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is not configured")
    if not org_allowed(org):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Self-serve billing is not enabled for this organization yet.",
        )


# ── price mapping ────────────────────────────────────────────────────────────


def plan_for_price(price: dict | None) -> tuple[str, str, int] | None:
    """Stripe price -> (plan, interval, licences). lookup_key first, metadata as backup.

    Only USD recurring prices of a known pack map; anything else returns None.
    """
    if not price:
        return None
    if (price.get("currency") or "").lower() != CURRENCY:
        return None
    parsed = parse_lookup_key(price.get("lookup_key"))
    if parsed:
        plan, interval = parsed
    else:
        metadata = price.get("metadata") or {}
        plan = (metadata.get("plan") or "").strip().lower()
        recurring = (price.get("recurring") or {}).get("interval")
        interval = next((k for k, v in INTERVALS.items() if v == recurring), "")
        if plan not in PACK_ORDER or not interval:
            return None
    return plan, interval, plan_licences(plan)


def subscription_price(subscription: dict) -> dict | None:
    items = ((subscription.get("items") or {}).get("data")) or []
    if not items:
        return None
    return items[0].get("price")


def resolve_price_id(plan: str, interval: str) -> str:
    """Find the live price for a pack by lookup_key and check it matches the catalogue."""
    key = lookup_key_for(plan, interval)
    cache_key = f"{'live' if stripe_livemode() else 'test'}:{key}"
    if cache_key in _price_cache:
        return _price_cache[cache_key]
    stripe = _stripe()
    found = stripe.Price.list(lookup_keys=[key], active=True, limit=1).data
    if not found:
        logger.error("Stripe price not found for lookup_key=%s", key)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Pricing is not configured")
    price = _plain(found[0])
    recurring = (price.get("recurring") or {}).get("interval")
    if (
        price.get("currency") != CURRENCY
        or recurring != INTERVALS[interval]
        or price.get("unit_amount") != unit_amount_cents(plan, interval)
    ):
        logger.error("Stripe price %s does not match the catalogue for %s", price.get("id"), key)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Pricing is misconfigured")
    _price_cache[cache_key] = price["id"]
    return price["id"]


# ── checkout ─────────────────────────────────────────────────────────────────


def billing_url(org: Org, **query: str) -> str:
    base = (settings.web_app_url or "").rstrip("/")
    params = "&".join(f"{k}={v}" for k, v in {"tab": "billing", **query}.items())
    return f"{base}/orgs/{org.slug}/settings?{params}"


def build_checkout_params(
    org: Org,
    *,
    customer_id: str,
    price_id: str,
    plan: str,
    interval: str,
    user_id: uuid.UUID | str,
    automatic_tax: bool,
) -> dict[str, Any]:
    org_meta = {"org_id": str(org.id), "org_slug": org.slug}
    params: dict[str, Any] = {
        "mode": "subscription",
        "customer": customer_id,
        "client_reference_id": str(org.id),
        "line_items": [{"price": price_id, "quantity": 1}],
        "metadata": {**org_meta, "plan": plan, "interval": interval, "user_id": str(user_id)},
        "subscription_data": {"metadata": {**org_meta, "plan": plan}},
        # Stripe replaces {CHECKOUT_SESSION_ID}; the page only uses it to show a "processing" note.
        "success_url": billing_url(org, checkout="success", session_id="{CHECKOUT_SESSION_ID}"),
        "cancel_url": billing_url(org, checkout="cancelled"),
        "allow_promotion_codes": True,
    }
    if automatic_tax:
        params["automatic_tax"] = {"enabled": True}
        params["billing_address_collection"] = "required"
        params["tax_id_collection"] = {"enabled": True}
        params["customer_update"] = {"address": "auto", "name": "auto"}
    return params


async def ensure_customer(db: AsyncSession, org: Org, *, email: str) -> str:
    """Reuse the org's Stripe customer, or create one (metadata.org_id) and store its id."""
    stripe = _stripe()
    if org.stripe_customer_id:
        try:
            existing = stripe.Customer.retrieve(org.stripe_customer_id)
            if not getattr(existing, "deleted", False):
                return org.stripe_customer_id
        except stripe.error.InvalidRequestError as exc:
            if getattr(exc, "code", None) != "resource_missing":
                raise
        logger.warning("Org %s Stripe customer missing; creating a new one", org.slug)
    customer = stripe.Customer.create(
        email=email,
        name=org.name,
        metadata={"org_id": str(org.id), "org_slug": org.slug},
        idempotency_key=f"bubomap-customer-{org.id}-{org.stripe_customer_id or 'new'}",
    )
    org.stripe_customer_id = customer.id
    await db.flush()
    return customer.id


async def create_checkout_session(
    db: AsyncSession,
    org: Org,
    *,
    plan: str,
    interval: str,
    user_email: str,
    user_id: uuid.UUID,
    licences_in_use: int,
) -> tuple[str, str]:
    _require_ready(org)
    if plan not in PACK_ORDER or interval not in INTERVALS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown plan or billing interval")
    # Hard guard against a second subscription. Plan changes go through the Customer Portal.
    # The stored id covers the normal case; asking Stripe covers an org row that does not show
    # the subscription yet (webhook not processed, or a lost update). If Stripe can't answer we
    # refuse too: a retry costs the owner a click, a duplicate subscription costs them money.
    if org.stripe_subscription_id:
        raise _already_subscribed()
    if not paid_plans_open_for(org):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={
                "code": "paid_plans_coming_soon",
                "message": "Paid plans are coming soon. Your organization stays on its current plan.",
            },
        )
    try:
        live = await open_subscription_for_customer(org.stripe_customer_id)
    except StripeLookupError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "billing_check_failed",
                "message": "Couldn't confirm your billing status with Stripe. Try again in a moment.",
            },
        ) from None
    if live:
        raise _already_subscribed()
    if licences_in_use > plan_licences(plan):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "licences_exceed_plan",
                "message": (
                    f"{licences_in_use} licences are in use; {plan.title()} includes "
                    f"{plan_licences(plan)}. Pick a larger plan or free up licences first."
                ),
            },
        )
    price_id = resolve_price_id(plan, interval)
    customer_id = await ensure_customer(db, org, email=user_email)
    await asyncio.to_thread(_expire_open_checkout_sessions, customer_id)
    params = build_checkout_params(
        org,
        customer_id=customer_id,
        price_id=price_id,
        plan=plan,
        interval=interval,
        user_id=user_id,
        automatic_tax=automatic_tax_enabled(),
    )
    session = await asyncio.to_thread(lambda: _stripe().checkout.Session.create(**params))
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=user_id,
        action="billing.checkout_started",
        target_type="org",
        target_id=org.id,
        metadata={"plan": plan, "interval": interval, "session_id": session.id},
    )
    return session.url, session.id


def _already_subscribed() -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT,
        detail={
            "code": "already_subscribed",
            "message": "This organization already has a subscription. Use Manage billing to change it.",
        },
    )


def _expire_open_checkout_sessions(customer_id: str) -> None:
    """Only the newest Checkout can be paid: two tabs can't produce two subscriptions."""
    stripe = _stripe()
    try:
        for session in stripe.checkout.Session.list(customer=customer_id, status="open", limit=20).data:
            stripe.checkout.Session.expire(session.id)
    except Exception as exc:
        logger.warning("Could not expire open Checkout Sessions for %s: %s", customer_id, exc)


# ── customer portal ──────────────────────────────────────────────────────────


def resolve_portal_configuration(variant: str) -> str | None:
    """Portal config created by scripts/stripe_bootstrap.py (metadata.bubomap_portal)."""
    cache_key = f"{'live' if stripe_livemode() else 'test'}:{variant}"
    if cache_key in _portal_cache:
        return _portal_cache[cache_key]
    stripe = _stripe()
    found = None
    for config in stripe.billing_portal.Configuration.list(active=True, limit=100).auto_paging_iter():
        if (config.metadata or {}).get("bubomap_portal") == variant:
            found = config.id
            break
    if not found:
        logger.warning("Stripe portal configuration %s not found; using the account default", variant)
    _portal_cache[cache_key] = found
    return found


async def create_portal_session(org: Org, *, licences_in_use: int) -> str:
    _require_ready(org)
    if not org.stripe_customer_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "no_billing_account", "message": "No billing account yet. Choose a plan first."},
        )
    # ?portal=return makes the page re-read billing status while the plan-change webhooks land.
    params: dict[str, Any] = {
        "customer": org.stripe_customer_id,
        "return_url": billing_url(org, portal="return"),
    }
    configuration = resolve_portal_configuration(portal_variant_for_licences(licences_in_use))
    if configuration:
        params["configuration"] = configuration
    session = await asyncio.to_thread(lambda: _stripe().billing_portal.Session.create(**params))
    return session.url


# ── legacy Solo endpoint (kept for API compatibility) ───────────────────────


async def create_solo_checkout_session(
    db: AsyncSession,
    org: Org,
    *,
    user_email: str,
    user_id: uuid.UUID,
) -> tuple[str, str]:
    del db, user_email, user_id
    if normalize_plan(org.plan) != "free":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="This org is already on a paid plan.")
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail="Solo checkout is no longer available. Choose a plan in Settings → Plan & billing.",
    )


# ── webhook ──────────────────────────────────────────────────────────────────


def verify_webhook(payload: bytes, signature: str, secret: str) -> dict:
    """Check the Stripe-Signature header and return the event as a plain dict."""
    import stripe

    stripe.WebhookSignature.verify_header(payload.decode("utf-8"), signature, secret, tolerance=300)
    return json.loads(payload)


def invoice_subscription_id(invoice: dict) -> str | None:
    """acacia: invoice.subscription; basil+: invoice.parent.subscription_details.subscription."""
    direct = _id(invoice.get("subscription"))
    if direct:
        return direct
    parent = invoice.get("parent") or {}
    return _id((parent.get("subscription_details") or {}).get("subscription"))


async def _org_by_id(db: AsyncSession, raw_id: str | None) -> Org | None:
    if not raw_id:
        return None
    try:
        oid = uuid.UUID(str(raw_id))
    except ValueError:
        return None
    result = await db.execute(select(Org).where(Org.id == oid))
    return result.scalar_one_or_none()


async def _org_by_subscription(db: AsyncSession, subscription_id: str | None) -> Org | None:
    if not subscription_id:
        return None
    result = await db.execute(select(Org).where(Org.stripe_subscription_id == subscription_id))
    return result.scalar_one_or_none()


async def _lock_org(db: AsyncSession, org: Org) -> Org:
    result = await db.execute(
        select(Org).where(Org.id == org.id).with_for_update().execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none() or org


async def _set_rls(db: AsyncSession, org_id: uuid.UUID) -> None:
    from app.services.tenancy import _set_rls_org

    await _set_rls_org(db, org_id)


async def _event_seen(db: AsyncSession, org_id: uuid.UUID, event_id: str) -> bool:
    result = await db.execute(
        text(
            "SELECT 1 FROM audit_log WHERE org_id = :org_id AND action = :action "
            "AND metadata->>'event_id' = :event_id LIMIT 1"
        ),
        {"org_id": str(org_id), "action": EVENT_AUDIT_ACTION, "event_id": event_id},
    )
    return result.first() is not None


class StripeRetryableError(RuntimeError):
    """Raised when an event can't be processed yet; the webhook answers 500 so Stripe retries."""


def _fetch_subscription(subscription_id: str) -> dict | None:
    try:
        return _plain(_stripe().Subscription.retrieve(subscription_id))
    except Exception as exc:  # network / missing — callers fall back to the event payload
        logger.warning("Could not retrieve subscription %s: %s", subscription_id, exc)
        return None


class StripeLookupError(RuntimeError):
    """Stripe could not be asked. Callers fail safe: no checkout, no "legacy" label."""


def _customer_open_subscription(customer_id: str) -> dict | None:
    """The customer's active/trialing/past_due subscription, straight from Stripe, or None.

    Blocking (stripe-python is sync); call through open_subscription_for_customer.
    """
    try:
        # status="all": the default list leaves out trialing/past_due in some API versions.
        found = _stripe().Subscription.list(customer=customer_id, status="all", limit=20).data
    except Exception as exc:
        logger.warning("Could not list subscriptions for customer %s: %s", customer_id, exc)
        raise StripeLookupError(str(exc)) from exc
    for sub in found:
        plain = _plain(sub)
        if plain.get("status") in ACTIVE_STATUSES:
            return plain
    return None


OPEN_SUBSCRIPTION_CACHE_SECONDS = 15.0
_open_subscription_cache: dict[str, tuple[float, dict | None]] = {}


async def open_subscription_for_customer(customer_id: str | None, *, cached: bool = False) -> dict | None:
    """Ask Stripe (off the event loop) for the customer's open subscription.

    cached=True reuses an answer up to OPEN_SUBSCRIPTION_CACHE_SECONDS old; only billing status
    uses it (polled by several components). Checkout always asks fresh. Raises StripeLookupError.
    """
    if not customer_id:
        return None
    now = time.monotonic()
    if cached:
        hit = _open_subscription_cache.get(customer_id)
        if hit and now - hit[0] < OPEN_SUBSCRIPTION_CACHE_SECONDS:
            return hit[1]
    found = await asyncio.to_thread(_customer_open_subscription, customer_id)
    _open_subscription_cache[customer_id] = (now, found)
    return found


async def subscription_state(org: Org) -> tuple[bool, str | None]:
    """(has_subscription, live_plan) for billing status.

    has_subscription is True when the org row has a subscription id OR Stripe holds an open
    subscription for the org's customer that the row does not show yet. live_plan is that
    subscription's plan (None when the row is authoritative or the price is unknown).
    When Stripe can't be asked we answer has_subscription=True: the page then offers Manage
    billing instead of checkout buttons, which is the safe side.
    """
    if org.stripe_subscription_id:
        return True, None
    if not org.stripe_customer_id or not checkout_available(org):
        return False, None
    try:
        live = await open_subscription_for_customer(org.stripe_customer_id, cached=True)
    except StripeLookupError:
        return True, None
    if not live:
        return False, None
    mapped = plan_for_price(subscription_price(live))
    return True, mapped[0] if mapped else None


async def handle_stripe_event(db: AsyncSession, event: dict) -> str:
    """Process one verified event. Returns a short outcome string (logged, used in tests)."""
    event_type = event.get("type") or ""
    event_id = event.get("id") or ""
    if event_type not in HANDLED_EVENTS:
        return "ignored:unhandled"
    if not stripe_configured():
        return "ignored:not_configured"
    if bool(event.get("livemode")) != stripe_livemode():
        logger.warning("Stripe event %s livemode mismatch; ignored", event_id)
        return "ignored:livemode_mismatch"

    obj = (event.get("data") or {}).get("object") or {}
    if event_type == "checkout.session.completed":
        org, subscription_id = await _resolve_checkout(db, obj)
    elif event_type.startswith("customer.subscription."):
        org, subscription_id = await _resolve_subscription(db, obj)
    else:
        subscription_id = invoice_subscription_id(obj)
        org = await _org_by_subscription(db, subscription_id)

    if org is None:
        return "ignored:org_not_found"
    if not org_allowed(org):
        logger.info("Stripe event %s for org %s skipped (not allowed for this key)", event_id, org.slug)
        return "ignored:org_not_allowed"

    await _set_rls(db, org.id)
    # One event per org at a time. Stripe sends several events for one change within a second
    # (checkout: 4-6, portal switch: 5). Without the lock two of them can both pass the
    # duplicate check and race on the org_limits upsert. populate_existing refreshes the row,
    # so this handler sees whatever the previous event committed.
    org = await _lock_org(db, org)
    if event_id and await _event_seen(db, org.id, event_id):
        return "duplicate"

    if event_type in ("invoice.paid", "invoice.payment_failed"):
        outcome = await _on_invoice(db, org, event_type, obj, subscription_id)
    else:
        payload_sub = obj if event_type.startswith("customer.subscription.") else None
        outcome = await _sync_subscription(
            db,
            org,
            subscription_id,
            payload=payload_sub,
            linking=event_type == "checkout.session.completed",
        )

    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=None,
        action=EVENT_AUDIT_ACTION,
        target_type="org",
        target_id=org.id,
        metadata={"event_id": event_id, "type": event_type, "outcome": outcome},
    )
    await db.commit()
    logger.info("Stripe %s %s org=%s -> %s", event_type, event_id, org.slug, outcome)
    return outcome


async def _resolve_checkout(db: AsyncSession, session: dict) -> tuple[Org | None, str | None]:
    if session.get("mode") != "subscription":
        return None, None
    if session.get("status") not in (None, "complete"):
        return None, None
    subscription_id = _id(session.get("subscription"))
    metadata = session.get("metadata") or {}
    org = await _org_by_id(db, metadata.get("org_id") or session.get("client_reference_id"))
    if org is None or not subscription_id:
        return None, None
    customer_id = _id(session.get("customer"))
    if org.stripe_customer_id and customer_id and org.stripe_customer_id != customer_id:
        logger.error("checkout.session.completed customer mismatch for org %s", org.slug)
        return None, None
    return org, subscription_id


async def _resolve_subscription(db: AsyncSession, subscription: dict) -> tuple[Org | None, str | None]:
    subscription_id = _id(subscription.get("id"))
    org = await _org_by_subscription(db, subscription_id)
    if org is not None:
        return org, subscription_id
    # Not linked yet (event can arrive before checkout.session.completed): link only through the
    # org id we put in subscription metadata AND the customer we created for that org.
    metadata = subscription.get("metadata") or {}
    candidate = await _org_by_id(db, metadata.get("org_id"))
    customer_id = _id(subscription.get("customer"))
    if candidate is None or not customer_id or candidate.stripe_customer_id != customer_id:
        return None, subscription_id
    if candidate.stripe_subscription_id and candidate.stripe_subscription_id != subscription_id:
        logger.warning("Org %s already linked to another subscription; event ignored", candidate.slug)
        return None, subscription_id
    return candidate, subscription_id


async def _sync_subscription(
    db: AsyncSession,
    org: Org,
    subscription_id: str | None,
    *,
    payload: dict | None,
    linking: bool,
) -> str:
    if not subscription_id:
        return "ignored:no_subscription"
    subscription = await asyncio.to_thread(_fetch_subscription, subscription_id) or payload
    if not subscription:
        # Nothing recorded, so Stripe's retry will process this event again.
        raise StripeRetryableError(f"subscription {subscription_id} unavailable")
    sub_status = subscription.get("status") or ""
    previous_plan = normalize_plan(org.plan)
    previous_sub = org.stripe_subscription_id

    if previous_sub and previous_sub != subscription_id:
        if not linking:
            return "ignored:subscription_mismatch"
        # Should not happen any more (checkout refuses when a subscription exists), but if it
        # does, the old subscription is still billing: leave a trail so it can be refunded.
        logger.error("Org %s: checkout replaces subscription %s with %s", org.slug, previous_sub, subscription_id)
        await log_audit(
            db,
            org_id=org.id,
            actor_user_id=None,
            action="billing.duplicate_subscription",
            target_type="org",
            target_id=org.id,
            metadata={"previous_subscription_id": previous_sub, "subscription_id": subscription_id},
        )

    if sub_status in ENDED_STATUSES:
        if previous_sub != subscription_id:
            return "ignored:not_current_subscription"
        await apply_plan_to_org(db, org.id, "free", clear_stripe=True, stripe_managed=True)
        await log_audit(
            db,
            org_id=org.id,
            actor_user_id=None,
            action="billing.plan_downgraded",
            target_type="org",
            target_id=org.id,
            metadata={
                "from": previous_plan,
                "plan": "free",
                "reason": f"subscription_{sub_status}",
                "subscription_id": subscription_id,
            },
        )
        return "downgraded:free"

    if sub_status not in ACTIVE_STATUSES:
        return f"ignored:status_{sub_status or 'unknown'}"

    mapped = plan_for_price(subscription_price(subscription))
    if not mapped:
        logger.error("Subscription %s has a price that maps to no plan", subscription_id)
        return "ignored:unknown_price"
    plan, interval, licences = mapped

    await apply_plan_to_org(
        db,
        org.id,
        plan,
        stripe_customer_id=_id(subscription.get("customer")),
        stripe_subscription_id=subscription_id,
        stripe_managed=True,
    )
    if plan != previous_plan or previous_sub != subscription_id:
        await log_audit(
            db,
            org_id=org.id,
            actor_user_id=None,
            action="billing.plan_changed",
            target_type="org",
            target_id=org.id,
            metadata={
                "from": previous_plan,
                "plan": plan,
                "interval": interval,
                "licences": licences,
                "status": sub_status,
                "subscription_id": subscription_id,
            },
        )
    return f"synced:{plan}:{interval}"


async def _on_invoice(
    db: AsyncSession, org: Org, event_type: str, invoice: dict, subscription_id: str | None
) -> str:
    if event_type == "invoice.payment_failed":
        await log_audit(
            db,
            org_id=org.id,
            actor_user_id=None,
            action="billing.payment_failed",
            target_type="org",
            target_id=org.id,
            metadata={
                "invoice_id": invoice.get("id"),
                "attempt_count": invoice.get("attempt_count"),
                "next_payment_attempt": invoice.get("next_payment_attempt"),
                "subscription_id": subscription_id,
            },
        )
        return "recorded:payment_failed"
    # invoice.paid: re-sync so a recovered past_due subscription is current again.
    outcome = await _sync_subscription(db, org, subscription_id, payload=None, linking=False)
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=None,
        action="billing.invoice_paid",
        target_type="org",
        target_id=org.id,
        metadata={
            "invoice_id": invoice.get("id"),
            "amount_paid": invoice.get("amount_paid"),
            "currency": invoice.get("currency"),
            "subscription_id": subscription_id,
        },
    )
    return f"paid:{outcome}"
