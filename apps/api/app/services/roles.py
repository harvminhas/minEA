"""Role constants — permission checks go through authorization.can()."""

ORG_OWNER = "owner"
ORG_ADMIN = "admin"
ORG_MEMBER = "member"

WS_ADMIN = "admin"
WS_MEMBER = "member"
WS_VIEWER = "viewer"

# Backward-compatible alias
WS_EDITOR = WS_MEMBER

ORG_ADMIN_ROLES = {ORG_OWNER, ORG_ADMIN}


def effective_workspace_role(org_role: str, workspace_role: str | None) -> str | None:
    """Org Owners/Admins implicitly get Admin on all workspaces."""
    if org_role in ORG_ADMIN_ROLES:
        return WS_ADMIN
    return workspace_role
