"""Deterministic domain colour/icon from the name (and optional description).

Keep the keyword rules in sync with apps/web/lib/domain-theme.ts.
No migration: icon and color are stored on business_domain.properties (JSON).
"""
from __future__ import annotations

import re

# theme id -> lucide icon key (must exist in apps/web/lib/capability-map-icons.ts)
THEME_ICONS = {
    "strategy": "compass",
    "land": "land-plot",
    "construction": "hard-hat",
    "sales": "megaphone",
    "customer": "heart-handshake",
    "finance": "circle-dollar-sign",
    "people": "users",
    "technology": "layers",
    "generic": "layout-grid",
}

# First matching rule wins. More specific themes are listed first.
_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("land", re.compile(r"\b(land|entitlement|entitlements|real[\s-]?estate|landhold)", re.I)),
    ("construction", re.compile(r"\b(construction|home[\s-]?design|home[\s-]?build(?:ing)?|homebuilding|building|trades)\b", re.I)),
    ("customer", re.compile(r"\b(customer|warranty|after[\s-]?sales|aftercare)\b", re.I)),
    ("sales", re.compile(r"\b(sales|marketing|brand|advertising|campaigns?)\b", re.I)),
    ("people", re.compile(r"\b(people|workforce|human[\s-]?resources|hr|talent|recruit|payroll)\b", re.I)),
    ("finance", re.compile(r"\b(finance|financial|treasury|accounting|accounts?|funding|revenue|tax)\b", re.I)),
    ("technology", re.compile(r"\b(technology|platforms?|infrastructure|information[\s-]?technology|\bit\b|digital|software|systems?)\b", re.I)),
    ("strategy", re.compile(r"\b(strateg|governance|corporate[\s-]?planning|policy|policies|board|compliance)\b", re.I)),
]


def _match_theme(text: str) -> str | None:
    if not (text or "").strip():
        return None
    for theme, pattern in _RULES:
        if pattern.search(text):
            return theme
    return None


def pick_domain_theme(name: str, description: str | None = None) -> tuple[str, str]:
    """Return (theme_id, icon_key). Unknown names get the generic fallback.

    The name is matched first so a description like "systems for building…"
    cannot override "Technology & Platforms" with the construction theme.
    """
    theme = _match_theme(name or "") or _match_theme(f"{name or ''} {description or ''}") or "generic"
    return theme, THEME_ICONS[theme]


def decorate_domain(item: dict) -> dict:
    """Fill icon and color when missing. Never overwrites values already set."""
    name = str(item.get("name") or "")
    description = item.get("description")
    desc = str(description).strip() if isinstance(description, str) else None
    theme, icon = pick_domain_theme(name, desc)
    if not item.get("icon"):
        item["icon"] = icon
    if not item.get("color"):
        item["color"] = theme
    if desc:
        item["description"] = desc
    elif "description" in item and not item.get("description"):
        item["description"] = None
    return item
