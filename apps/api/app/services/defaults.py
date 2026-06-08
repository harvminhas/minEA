"""Default org limits — single source of truth for v1 quotas."""

DEFAULT_ORG_LIMITS: dict[str, int | None] = {
    "max_owners": 1,
    "max_admins": 5,
    "max_members": 50,
    "max_viewers": 50,
    "max_workspaces": 10,
    "max_objects_per_workspace": 1000,
    "max_pending_invites": 20,
    "max_scenarios_per_workspace": 10,
    "max_sandboxes_per_workspace": 5,
    "ai_extractions_per_month": 100,
    "max_active_share_links": 5,
}

# Maps invite/membership role to the quota key enforced on assignment
ROLE_LIMIT_KEYS: dict[str, str] = {
    "owner": "max_owners",
    "admin": "max_admins",
    "member": "max_members",
    "viewer": "max_viewers",
}
