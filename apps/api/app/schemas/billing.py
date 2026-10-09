from typing import Literal

from pydantic import BaseModel


class SoloCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class CheckoutRequest(BaseModel):
    plan: Literal["starter", "team", "business"]
    interval: Literal["monthly", "yearly"]


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    portal_url: str


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
    # Self-serve packs (all optional for older clients)
    checkout_available: bool = False
    # False whenever the org has (or may have) an open Stripe subscription: change plans in the portal.
    checkout_allowed: bool = False
    # False = Starter/Team/Business are "coming soon" for this org (STRIPE_CHECKOUT_ORG_SLUGS /
    # STRIPE_CHECKOUT_OPEN). Subscribed orgs still get Manage billing.
    paid_plans_available: bool = False
    display_plan: str = "free"  # free | starter | team | business | business_legacy
    licences_used: int = 0
    licences_cap: int | None = None  # None = no cap (Business legacy)
    over_licence_cap: bool = False
    has_billing_account: bool = False
    can_manage_billing: bool = False
