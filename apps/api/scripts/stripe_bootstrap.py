"""Create or update BuboMap's Stripe catalogue idempotently (products, prices, portal configs).

Usage (from apps/api):
    python scripts/stripe_bootstrap.py --key-env STRIPE_SECRET_KEY
    python scripts/stripe_bootstrap.py --key-env STRIPE_SECRET_KEY \
        --webhook-url https://example.com/api/v1/webhooks/stripe --secret-out /path/outside/repo.env

The key is read from the named environment variable and is never printed.
Live keys are refused unless --allow-live is passed.

Idempotency:
- Products use fixed ids (bubomap_starter, bubomap_team, bubomap_business).
- Prices are found by lookup_key (bubomap_<plan>_<interval>). A price whose amount, currency,
  interval or product no longer matches is replaced by a new price that takes over the lookup_key
  (transfer_lookup_key); the old one is archived.
- Portal configurations are found by metadata.bubomap_portal and updated in place.
- The webhook endpoint is found by URL and updated in place. Its signing secret is only
  available at creation time and is written to --secret-out (chmod 600), never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from pathlib import Path

import stripe

PLANS_PATH = Path(__file__).resolve().parents[1] / "app" / "services" / "plans.json"
CATALOG = json.loads(PLANS_PATH.read_text(encoding="utf-8"))
API_VERSION = "2024-12-18.acacia"

WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
]

CANCEL_REASONS = ["too_expensive", "missing_features", "switched_service", "unused", "other"]


def lookup_key(plan: str, interval: str) -> str:
    return f"{CATALOG['lookup_key_prefix']}_{plan}_{interval}"


def product_id(plan: str) -> str:
    return f"{CATALOG['lookup_key_prefix']}_{plan}"


def ensure_product(plan: str) -> stripe.Product:
    spec = CATALOG["plans"][plan]
    pid = product_id(plan)
    params = {
        "name": f"BuboMap {spec['label']}",
        "description": (
            f"{spec['licences']} licence{'s' if spec['licences'] != 1 else ''} "
            "(people who edit). Unlimited free viewers."
        ),
        "metadata": {"plan": plan, "licences": str(spec["licences"]), "app": "bubomap"},
        "tax_code": "txcd_10103001",  # SaaS - business use
        "active": True,
    }
    try:
        stripe.Product.retrieve(pid)
        return stripe.Product.modify(pid, **params)
    except stripe.error.InvalidRequestError as exc:
        if getattr(exc, "code", None) != "resource_missing":
            raise
    return stripe.Product.create(id=pid, **params)


def ensure_price(plan: str, interval: str) -> stripe.Price:
    spec = CATALOG["plans"][plan]
    key = lookup_key(plan, interval)
    amount = (spec["monthly_usd"] if interval == "monthly" else spec["yearly_usd"]) * 100
    stripe_interval = CATALOG["intervals"][interval]
    metadata = {
        "plan": plan,
        "licences": str(spec["licences"]),
        "interval": interval,
        "app": "bubomap",
    }
    existing = stripe.Price.list(lookup_keys=[key], limit=1).data
    if existing:
        price = existing[0]
        product = price.product if isinstance(price.product, str) else price.product.id
        if (
            price.unit_amount == amount
            and price.currency == "usd"
            and price.recurring
            and price.recurring.interval == stripe_interval
            and product == product_id(plan)
        ):
            if not price.active or dict(price.metadata or {}) != metadata:
                price = stripe.Price.modify(price.id, active=True, metadata=metadata)
            return price
    created = stripe.Price.create(
        product=product_id(plan),
        currency="usd",
        unit_amount=amount,
        recurring={"interval": stripe_interval},
        tax_behavior="exclusive",
        lookup_key=key,
        transfer_lookup_key=True,
        nickname=f"{CATALOG['plans'][plan]['label']} {interval}",
        metadata=metadata,
    )
    if existing:
        stripe.Price.modify(existing[0].id, active=False)
    return created


def portal_features(products: list[dict]) -> dict:
    return {
        "customer_update": {"enabled": True, "allowed_updates": ["email", "address", "name", "tax_id"]},
        "invoice_history": {"enabled": True},
        "payment_method_update": {"enabled": True},
        "subscription_cancel": {
            "enabled": True,
            "mode": "at_period_end",
            "proration_behavior": "none",
            "cancellation_reason": {"enabled": True, "options": CANCEL_REASONS},
        },
        "subscription_update": {
            "enabled": True,
            "default_allowed_updates": ["price"],
            "proration_behavior": "always_invoice",
            "products": products,
            "schedule_at_period_end": {"conditions": [{"type": "shortening_interval"}]},
        },
    }


def ensure_portal(variant: str, plans: list[str], prices: dict[str, dict[str, str]]):
    products = [
        {"product": product_id(p), "prices": [prices[p]["monthly"], prices[p]["yearly"]]} for p in plans
    ]
    params = {
        "business_profile": {"headline": "Manage your BuboMap subscription"},
        "features": portal_features(products),
        "metadata": {"bubomap_portal": variant, "app": "bubomap"},
    }
    for config in stripe.billing_portal.Configuration.list(limit=100).auto_paging_iter():
        if (config.metadata or {}).get("bubomap_portal") == variant:
            return stripe.billing_portal.Configuration.modify(config.id, active=True, **params)
    return stripe.billing_portal.Configuration.create(**params)


def ensure_webhook(url: str, secret_out: Path | None):
    for endpoint in stripe.WebhookEndpoint.list(limit=100).auto_paging_iter():
        if endpoint.url == url:
            updated = stripe.WebhookEndpoint.modify(
                endpoint.id, enabled_events=WEBHOOK_EVENTS, disabled=False
            )
            return updated, False
    if secret_out is None:
        raise SystemExit("--secret-out is required when creating a webhook endpoint")
    created = stripe.WebhookEndpoint.create(
        url=url,
        enabled_events=WEBHOOK_EVENTS,
        api_version=API_VERSION,
        description="BuboMap subscription sync",
        metadata={"app": "bubomap"},
    )
    secret_out.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(secret_out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(f"STRIPE_WEBHOOK_SECRET={created.secret}\n")
        fh.write(f"# endpoint {created.id} -> {url}\n")
    os.chmod(secret_out, stat.S_IRUSR | stat.S_IWUSR)
    return created, True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--key-env", default="STRIPE_SECRET_KEY", help="env var holding the Stripe secret key")
    parser.add_argument("--allow-live", action="store_true", help="permit a live-mode key")
    parser.add_argument("--webhook-url", help="create/update a webhook endpoint at this URL")
    parser.add_argument("--secret-out", type=Path, help="file for the new endpoint's signing secret (chmod 600)")
    args = parser.parse_args()

    key = os.environ.get(args.key_env, "").strip()
    if not key:
        print(f"{args.key_env} is not set", file=sys.stderr)
        return 2
    live = key.startswith(("sk_live_", "rk_live_"))
    if live and not args.allow_live:
        print("Refusing to run with a live key without --allow-live", file=sys.stderr)
        return 2

    stripe.api_key = key
    stripe.api_version = API_VERSION

    out: dict = {"livemode": live, "api_version": API_VERSION, "products": {}, "prices": {}, "portal": {}}
    prices: dict[str, dict[str, str]] = {}
    for plan in CATALOG["pack_order"]:
        product = ensure_product(plan)
        out["products"][plan] = product.id
        prices[plan] = {}
        for interval in CATALOG["intervals"]:
            price = ensure_price(plan, interval)
            prices[plan][interval] = price.id
            out["prices"][lookup_key(plan, interval)] = {
                "id": price.id,
                "unit_amount": price.unit_amount,
                "currency": price.currency,
                "interval": price.recurring.interval,
            }
        stripe.Product.modify(product.id, default_price=prices[plan]["monthly"])

    for variant, plans in CATALOG["portal_configurations"].items():
        config = ensure_portal(variant, plans, prices)
        out["portal"][variant] = config.id

    if args.webhook_url:
        endpoint, created = ensure_webhook(args.webhook_url, args.secret_out)
        out["webhook_endpoint"] = {
            "id": endpoint.id,
            "url": endpoint.url,
            "api_version": endpoint.api_version,
            "created": created,
            "enabled_events": list(endpoint.enabled_events),
        }

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
