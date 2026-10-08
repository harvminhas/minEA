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
PORTAL_CONFIGURATIONS: dict[str, tuple[str, ...]] = {
    key: tuple(plans) for key, plans in _CATALOG["portal_configurations"].items()
}


def plan_licences(plan: str) -> int:
    return int(PLAN_CATALOG[plan]["licences"])


def lookup_key_for(plan: str, interval: str) -> str:
    if plan not in PACK_ORDER:
        raise ValueError(f"Not a paid pack: {plan}")
    if interval not in INTERVALS:
        raise ValueError(f"Unknown billing interval: {interval}")
    return f"{LOOKUP_KEY_PREFIX}_{plan}_{interval}"


def parse_lookup_key(lookup_key: str | None) -> tuple[str, str] | None:
    """bubomap_team_yearly -> ("team", "yearly"); anything else -> None."""
    if not lookup_key:
        return None
    parts = lookup_key.split("_")
    if len(parts) != 3 or parts[0] != LOOKUP_KEY_PREFIX:
        return None
    plan, interval = parts[1], parts[2]
    if plan not in PACK_ORDER or interval not in INTERVALS:
        return None
    return plan, interval


def unit_amount_cents(plan: str, interval: str) -> int:
    spec = PLAN_CATALOG[plan]
    return int(spec["monthly_usd" if interval == "monthly" else "yearly_usd"]) * 100


def portal_variant_for_licences(licences_in_use: int) -> str:
    """Smallest-allowed-pack portal config: never offer a pack the org can't fit into."""
    for variant, plans in PORTAL_CONFIGURATIONS.items():
        if min(plan_licences(p) for p in plans) >= licences_in_use:
            return variant
    return list(PORTAL_CONFIGURATIONS)[-1]
