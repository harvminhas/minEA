from pydantic import BaseModel


class SoloCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class BillingStatusResponse(BaseModel):
    plan: str
    stripe_configured: bool
    can_upgrade_solo: bool
    has_subscription: bool
    own_workspace_count: int
    own_workspace_limit: int | None
    can_create_own_workspace: bool
    active_share_link_count: int
    active_share_link_limit: int | None
    can_create_share_link: bool
