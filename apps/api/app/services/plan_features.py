"""Billing plan capabilities — single source of truth for Free / Solo / Team."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.services.defaults import DEFAULT_ORG_LIMITS

PLANS = ("free", "solo", "team")

# View resource keys (views/* segments) included per plan
FREE_VIEW_KEYS = frozenset({"views/products"})
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

PLAN_VIEW_KEYS: dict[str, frozenset[str]] = {
    "free": FREE_VIEW_KEYS,
    "solo": ALL_VIEW_KEYS,
    "team": ALL_VIEW_KEYS,
}

PLAN_SHARE_RESOURCE_TYPES: dict[str, set[str]] = {
    "free": {"view"},
    "solo": {"view", "roadmap", "object", "capability_map", "capability_domain"},
    "team": {"view", "roadmap", "object", "capability_map", "capability_domain"},
}

PLAN_AI_CHAT: dict[str, bool] = {
    "free": False,
    "solo": True,
    "team": True,
}

PLAN_INVITES: dict[str, bool] = {
    "free": False,
    "solo": False,
    "team": True,
}

# Owned workspaces in this org (not guest workspaces in other orgs — those are unlimited).
PLAN_MAX_OWN_WORKSPACES: dict[str, int | None] = {
    "free": 1,
    "solo": 5,
    "team": 10,
}

PLAN_MAX_ACTIVE_SHARE_LINKS: dict[str, int | None] = {
    "free": 1,
    "solo": 20,
    "team": 50,
}

# Per-plan org limit overrides (None = unlimited)
PLAN_LIMIT_OVERRIDES: dict[str, dict[str, int | None]] = {
    "free": {
        "max_workspaces": 1,
        "max_pending_invites": 0,
        "max_admins": 0,
        "max_members": 0,
        "max_viewers": 0,
        "max_active_share_links": 1,
    },
    "solo": {
        "max_workspaces": 5,
        "max_pending_invites": 0,
        "max_admins": 0,
        "max_members": 0,
        "max_viewers": 0,
        "max_active_share_links": 20,
    },
    "team": {
        "max_workspaces": 10,
        "max_viewers": None,
        "max_members": 10,
        "max_active_share_links": 50,
        "max_pending_invites": 50,
    },
}


def normalize_plan(plan: str | None) -> str:
    """Map legacy plan slugs and validate."""
    if not plan:
        return "free"
    legacy = {
        "starter": "solo",
        "growth": "solo",
        "business": "team",
    }
    normalized = legacy.get(plan, plan)
    if normalized not in PLANS:
        return "free"
    return normalized


def limits_for_plan(plan: str) -> dict[str, int | None]:
    base = dict(DEFAULT_ORG_LIMITS)
    base.update(PLAN_LIMIT_OVERRIDES.get(normalize_plan(plan), {}))
    return base


def plan_allows_ai_chat(plan: str) -> bool:
    return PLAN_AI_CHAT.get(normalize_plan(plan), False)


def plan_allows_invites(plan: str) -> bool:
    return PLAN_INVITES.get(normalize_plan(plan), False)


def plan_allows_view(plan: str, resource_key: str) -> bool:
    allowed = PLAN_VIEW_KEYS.get(normalize_plan(plan), FREE_VIEW_KEYS)
    return resource_key in allowed


def plan_allows_share(org_plan: str, resource_type: str) -> bool:
    return resource_type in PLAN_SHARE_RESOURCE_TYPES.get(normalize_plan(org_plan), set())


def assert_plan_allows_ai_chat(plan: str) -> None:
    if not plan_allows_ai_chat(plan):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "plan_feature_unavailable",
                "message": "AI chat is available on Solo and Team plans. Upgrade to unlock.",
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
            "Free includes one workspace for sharing your portfolio. "
            "Upgrade to Solo to create more workspaces, or join unlimited workspaces "
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
                "message": "Inviting teammates requires a Team plan. Solo is single-user; contact us for Team.",
                "feature": "invites",
                "plan": normalize_plan(plan),
            },
        )
