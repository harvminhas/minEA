"""Plan catalogue loaded from plans.json — the one source for plan keys, licences and prices.

apps/web/lib/billing/plans.ts mirrors this file; parity tests on both sides compare against it.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CATALOG: dict[str, Any] = json.loads(Path(__file__).with_name("plans.json").read_text(encoding="utf-8"))

PLAN_CATALOG: dict[str, dict[str, Any]] = _CATALOG["plans"]
PLAN_KEYS: tuple[str, ...] = tuple(PLAN_CATALOG)  # free, starter, team, business
PACK_ORDER: tuple[str, ...] = tuple(_CATALOG["pack_order"])  # starter, team, business
INTERVALS: dict[str, str] = dict(_CATALOG["intervals"])  # monthly -> month, yearly -> year
LEGACY_ALIASES: dict[str, str] = dict(_CATALOG["legacy_aliases"])
LOOKUP_KEY_PREFIX: str = _CATALOG["lookup_key_prefix"]
CURRENCY: str = _CATALOG["currency"]
# Intervals each pack is sold on today (new checkouts). Starter: monthly only.
SELL_INTERVALS: dict[str, tuple[str, ...]] = {
    plan: tuple(_CATALOG.get("sell_intervals", {}).get(plan, tuple(INTERVALS))) for plan in PACK_ORDER
}
# Lookup keys that differ from bubomap_<plan>_<interval> (a new price at a new amount).
LOOKUP_KEY_OVERRIDES: dict[str, dict[str, str]] = {
    plan: dict(keys) for plan, keys in _CATALOG.get("lookup_keys", {}).items()
}
# Retired prices that still map to their plan, so grandfathered subscriptions keep syncing.
LEGACY_LOOKUP_KEYS: dict[str, dict[str, Any]] = dict(_CATALOG.get("legacy_lookup_keys", {}))
PORTAL_CONFIGURATIONS: dict[str, tuple[str, ...]] = {
    key: tuple(plans) for key, plans in _CATALOG["portal_configurations"].items()
}


def plan_licences(plan: str) -> int:
    return int(PLAN_CATALOG[plan]["licences"])


def interval_on_sale(plan: str, interval: str) -> bool:
    """True when new checkouts may use this plan + interval (Starter: monthly only)."""
    return interval in SELL_INTERVALS.get(plan, ())


def lookup_key_for(plan: str, interval: str) -> str:
    """The lookup key of the price NEW checkouts use for this plan + interval."""
    if plan not in PACK_ORDER:
        raise ValueError(f"Not a paid pack: {plan}")
    if interval not in INTERVALS:
        raise ValueError(f"Unknown billing interval: {interval}")
    if not interval_on_sale(plan, interval):
        raise ValueError(f"{plan} is not sold {interval}")
    override = LOOKUP_KEY_OVERRIDES.get(plan, {}).get(interval)
    return override or f"{LOOKUP_KEY_PREFIX}_{plan}_{interval}"


def parse_lookup_key(lookup_key: str | None) -> tuple[str, str] | None:
    """bubomap_team_yearly -> ("team", "yearly"); anything else -> None.

    Also maps the override keys (bubomap_starter_monthly_149) and the legacy keys of retired
    prices (bubomap_starter_monthly at $99, bubomap_starter_yearly at $990) to their plan.
    """
    if not lookup_key:
        return None
    for plan, keys in LOOKUP_KEY_OVERRIDES.items():
        for interval, key in keys.items():
            if key == lookup_key:
                return plan, interval
    legacy = LEGACY_LOOKUP_KEYS.get(lookup_key)
    if legacy:
        return legacy["plan"], legacy["interval"]
    parts = lookup_key.split("_")
    if len(parts) != 3 or parts[0] != LOOKUP_KEY_PREFIX:
        return None
    plan, interval = parts[1], parts[2]
    if plan not in PACK_ORDER or interval not in INTERVALS:
        return None
    return plan, interval


def unit_amount_cents(plan: str, interval: str) -> int:
    """Catalogue amount for the price on sale. Raises ValueError for an interval not on sale."""
    spec = PLAN_CATALOG[plan]
    usd = spec["monthly_usd" if interval == "monthly" else "yearly_usd"]
    if usd is None or not interval_on_sale(plan, interval):
        raise ValueError(f"{plan} has no {interval} price on sale")
    return int(usd) * 100


def portal_variant_for_licences(licences_in_use: int) -> str:
    """Smallest-allowed-pack portal config: never offer a pack the org can't fit into."""
    for variant, plans in PORTAL_CONFIGURATIONS.items():
        if min(plan_licences(p) for p in plans) >= licences_in_use:
            return variant
    return list(PORTAL_CONFIGURATIONS)[-1]
