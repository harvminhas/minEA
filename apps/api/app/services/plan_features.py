"""Billing plan capabilities — Free and the paid packs (Starter / Team / Business).

Plan keys, licences and prices come from plans.json (see app/services/plans.py).
Every paid pack has the same features; packs differ only in licences (people who edit).

Grandfathering: an org on "business" with no Stripe subscription is "Business (legacy)".
It keeps its hand-set limits and has no licence cap (max_editor_seats is never written for it).
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.services.defaults import DEFAULT_ORG_LIMITS
from app.services.plans import LEGACY_ALIASES, PACK_ORDER, PLAN_KEYS, plan_licences

PLANS = PLAN_KEYS  # ("free", "starter", "team", "business")
PAID_PLANS = PACK_ORDER
# Plans an operator may set by hand (scripts/set_org_plan.py). Packs are only set by Stripe.
MANUAL_PLANS = ("free", "business")

# Licence cap key in org_limits. NULL / missing = no cap (legacy orgs).
EDITOR_SEATS_KEY = "max_editor_seats"

ALL_VIEW_KEYS = frozenset(
    {
        "views/products",
        "views/capability-heatmap",
        "views/journeys",
        "views/investments",
        "views/tech-debt",
        "views/processes",
    }
)

_ALL_SHARE_TYPES = {"view", "roadmap", "object", "capability_map", "capability_domain"}


def _per_plan(free_value, paid_value) -> dict:
    return {"free": free_value, **{plan: paid_value for plan in PAID_PLANS}}


PLAN_VIEW_KEYS: dict[str, frozenset[str]] = _per_plan(ALL_VIEW_KEYS, ALL_VIEW_KEYS)

PLAN_SHARE_RESOURCE_TYPES: dict[str, set[str]] = _per_plan({"view"}, _ALL_SHARE_TYPES)

PLAN_AI_CHAT: dict[str, bool] = _per_plan(False, True)

PLAN_INVITES: dict[str, bool] = _per_plan(False, True)

# Owned workspaces in this org (guest workspaces elsewhere are unlimited).
PLAN_MAX_OWN_WORKSPACES: dict[str, int | None] = _per_plan(1, None)

PLAN_MAX_ACTIVE_SHARE_LINKS: dict[str, int | None] = _per_plan(1, 50)

# Free: owner only. max_editor_seats = 1 matters after a paid org cancels (existing editors keep
# access; nobody new can be added).
_FREE_LIMITS: dict[str, int | None] = {
    "max_workspaces": 1,
    "max_objects_per_workspace": 50,
    "max_pending_invites": 0,
    "max_admins": 0,
    "max_members": 0,
    "max_viewers": 0,
    "max_active_share_links": 1,
    EDITOR_SEATS_KEY: plan_licences("free"),
}

# Hand-set Business (legacy) — unchanged from before packs. No licence cap.
LEGACY_BUSINESS_LIMITS: dict[str, int | None] = {
    "max_workspaces": None,
    "max_objects_per_workspace": None,
    "max_viewers": None,
    "max_members": 10,
    "max_active_share_links": 50,
    "max_pending_invites": 50,
    EDITOR_SEATS_KEY: None,
}


def _pack_limits(plan: str) -> dict[str, int | None]:
    # Licences govern editors (owner/admins + workspace admins/members); role caps are lifted.
    return {
        "max_workspaces": None,
        "max_objects_per_workspace": None,
        "max_viewers": None,
        "max_members": None,
        "max_admins": None,
        "max_active_share_links": 50,
        "max_pending_invites": 50,
        EDITOR_SEATS_KEY: plan_licences(plan),
    }


# Per-plan org limit overrides (None = unlimited). "business" here is the Stripe pack.
PLAN_LIMIT_OVERRIDES: dict[str, dict[str, int | None]] = {
    "free": _FREE_LIMITS,
    **{plan: _pack_limits(plan) for plan in PAID_PLANS},
}


def normalize_plan(plan: str | None) -> str:
    """Validate a stored plan slug. starter/team/business are distinct packs; solo/growth are
    pre-pack slugs that mean Business. Unknown values fall back to free."""
    if not plan:
        return "free"
    value = plan.strip().lower()
    value = LEGACY_ALIASES.get(value, value)
    if value not in PLANS:
        return "free"
    return value


def is_paid_plan(plan: str | None) -> bool:
    return normalize_plan(plan) in PAID_PLANS


def is_legacy_business(plan: str | None, stripe_subscription_id: str | None) -> bool:
    """Business set by hand before packs (no Stripe subscription)."""
    return normalize_plan(plan) == "business" and not stripe_subscription_id


def limits_for_plan(plan: str, *, stripe_managed: bool = False) -> dict[str, int | None]:
    """Org limits for a plan. Business without Stripe = legacy limits (unchanged, no licence cap)."""
    normalized = normalize_plan(plan)
    base = dict(DEFAULT_ORG_LIMITS)
    if normalized == "business" and not stripe_managed:
        base.update(LEGACY_BUSINESS_LIMITS)
    else:
        base.update(PLAN_LIMIT_OVERRIDES.get(normalized, {}))
    return base


def plan_allows_ai_chat(plan: str) -> bool:
    return PLAN_AI_CHAT.get(normalize_plan(plan), False)


def plan_allows_invites(plan: str) -> bool:
    return PLAN_INVITES.get(normalize_plan(plan), False)


def plan_allows_view(plan: str, resource_key: str) -> bool:
    allowed = PLAN_VIEW_KEYS.get(normalize_plan(plan), ALL_VIEW_KEYS)
    return resource_key in allowed


def plan_allows_share(org_plan: str, resource_type: str) -> bool:
    return resource_type in PLAN_SHARE_RESOURCE_TYPES.get(normalize_plan(org_plan), set())


def assert_plan_allows_ai_chat(plan: str) -> None:
    if not plan_allows_ai_chat(plan):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "plan_feature_unavailable",
                "message": "AI chat is available on the Business plan. Contact us to upgrade.",
                "feature": "ai_chat",
                "plan": normalize_plan(plan),
            },
        )


def plan_max_own_workspaces(plan: str) -> int | None:
    return PLAN_MAX_OWN_WORKSPACES.get(normalize_plan(plan))


def can_create_own_workspace(plan: str, current_count: int) -> bool:
    cap = plan_max_own_workspaces(plan)
    if cap is None:
        return True
    return current_count < cap


def plan_max_active_share_links(plan: str) -> int | None:
    return PLAN_MAX_ACTIVE_SHARE_LINKS.get(normalize_plan(plan))


def can_create_share_link(plan: str, current_count: int) -> bool:
    cap = plan_max_active_share_links(plan)
    if cap is None:
        return True
    return current_count < cap


def assert_can_create_own_workspace(plan: str, current_count: int) -> None:
    normalized = normalize_plan(plan)
    if can_create_own_workspace(normalized, current_count):
        return
    cap = plan_max_own_workspaces(normalized)
    if normalized == "free":
        message = (
            "Free includes one workspace. "
            "Contact us for Business to create more workspaces, or join unlimited workspaces "
            "shared with you by others."
        )
    else:
        message = (
            f"Your {normalized} plan allows up to {cap} owned workspaces. "
            "You can still access unlimited workspaces shared with you by other organizations."
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "plan_feature_unavailable",
            "message": message,
            "feature": "workspace_create",
            "plan": normalized,
            "max": cap,
            "current": current_count,
        },
    )


def assert_plan_allows_invites(plan: str) -> None:
    if not plan_allows_invites(plan):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "plan_feature_unavailable",
                "message": "Inviting teammates requires a Business plan. Contact us to upgrade.",
                "feature": "invites",
                "plan": normalize_plan(plan),
            },
        )
