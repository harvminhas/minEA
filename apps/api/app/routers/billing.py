"""Org billing — plan status, quotas, Stripe Checkout and Customer Portal."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.models.shares import ShareLink
from app.schemas.billing import (
    BillingStatusResponse,
    CheckoutRequest,
    CheckoutResponse,
    PortalResponse,
    SoloCheckoutResponse,
)
from app.services.authorization import get_org_limit
from app.services.licences import licence_cap, load_usage
from app.services.plan_features import (
    can_create_own_workspace,
    can_create_share_link,
    is_legacy_business,
    normalize_plan,
    plan_max_active_share_links,
    plan_max_own_workspaces,
)
from app.services.stripe_billing import (
    checkout_available,
    create_checkout_session,
    paid_plans_open_for,
    create_portal_session,
    create_solo_checkout_session,
    stripe_configured,
    subscription_state,
)
from app.services.tenancy import TenancyContext, get_org_context
from app.utils.time import utc_now

router = APIRouter(prefix="/orgs/{org_slug}/billing", tags=["billing"])

BILLING_ROLES = ("owner", "admin")


def can_manage_billing(ctx: TenancyContext) -> bool:
    """Org owner/admin with a verified email (same verification rule as other billing actions)."""
    return ctx.org_role in BILLING_ROLES and bool(ctx.email_verified)


def require_billing_manager(ctx: TenancyContext) -> None:
    if ctx.org_role not in BILLING_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only org owners and admins can manage billing")
    if not ctx.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Verify your email to manage billing")


def display_plan(plan: str, subscription_id: str | None, *, has_subscription: bool = False, live_plan: str | None = None) -> str:
    """What the admin centre shows.

    business_legacy means: plan business AND no subscription id on the org AND no open Stripe
    subscription for its customer (has_subscription False). live_plan is the plan of an open
    subscription the org row does not show yet; it wins so the page is right before the webhook.
    """
    if live_plan:
        return live_plan
    if is_legacy_business(plan, subscription_id) and not has_subscription:
        return "business_legacy"
    return normalize_plan(plan)


@router.get("/status", response_model=BillingStatusResponse)
async def billing_status(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> BillingStatusResponse:
    plan = normalize_plan(ctx.org.plan)
    count_result = await db.execute(
        select(func.count()).select_from(Workspace).where(Workspace.org_id == ctx.org_id)
    )
    owned_count = count_result.scalar_one()
    workspace_limit = await get_org_limit(db, ctx.org_id, "max_workspaces")
    if workspace_limit is None:
        workspace_limit = plan_max_own_workspaces(plan)

    now = utc_now()
    share_count_result = await db.execute(
        select(func.count())
        .select_from(ShareLink)
        .where(
            ShareLink.org_id == ctx.org_id,
            ShareLink.status == "active",
            ShareLink.expires_at > now,
        )
    )
    share_count = share_count_result.scalar_one()
    share_limit = await get_org_limit(db, ctx.org_id, "max_active_share_links")
    if share_limit is None:
        share_limit = plan_max_active_share_links(plan)

    usage = await load_usage(db, ctx.org_id)
    cap = await licence_cap(db, ctx.org_id)
    has_subscription, live_plan = await subscription_state(ctx.org)
    checkout_on = checkout_available(ctx.org)
    paid_open = checkout_on and paid_plans_open_for(ctx.org)

    return BillingStatusResponse(
        plan=plan,
        stripe_configured=stripe_configured(),
        can_upgrade_solo=False,
        has_subscription=has_subscription,
        own_workspace_count=owned_count,
        own_workspace_limit=workspace_limit,
        can_create_own_workspace=can_create_own_workspace(plan, owned_count),
        active_share_link_count=share_count,
        active_share_link_limit=share_limit,
        can_create_share_link=can_create_share_link(plan, share_count),
        checkout_available=checkout_on,
        checkout_allowed=paid_open and not has_subscription,
        paid_plans_available=paid_open,
        display_plan=display_plan(
            ctx.org.plan,
            ctx.org.stripe_subscription_id,
            has_subscription=has_subscription,
            live_plan=live_plan,
        ),
        licences_used=usage.used,
        licences_cap=cap,
        over_licence_cap=cap is not None and usage.used > cap,
        has_billing_account=bool(ctx.org.stripe_customer_id),
        can_manage_billing=can_manage_billing(ctx),
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def start_checkout(
    body: CheckoutRequest,
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> CheckoutResponse:
    """Stripe Checkout for a pack (subscription mode). Owner/admin with verified email only."""
    require_billing_manager(ctx)
    usage = await load_usage(db, ctx.org_id)
    checkout_url, session_id = await create_checkout_session(
        db,
        ctx.org,
        plan=body.plan,
        interval=body.interval,
        user_email=ctx.user.email,
        user_id=ctx.user_id,
        licences_in_use=usage.used,
    )
    await db.commit()
    return CheckoutResponse(checkout_url=checkout_url, session_id=session_id)


@router.post("/portal", response_model=PortalResponse)
async def open_portal(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> PortalResponse:
    """Stripe Customer Portal (payment method, invoices, plan switch, cancel)."""
    require_billing_manager(ctx)
    usage = await load_usage(db, ctx.org_id)
    url = await create_portal_session(ctx.org, licences_in_use=usage.used)
    return PortalResponse(portal_url=url)


@router.post("/solo/checkout", response_model=SoloCheckoutResponse)
async def start_solo_checkout(
    ctx: TenancyContext = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SoloCheckoutResponse:
    await ctx.require_permission(db, "org.billing.manage")

    checkout_url, session_id = await create_solo_checkout_session(
        db,
        ctx.org,
        user_email=ctx.user.email,
        user_id=ctx.user_id,
    )
    await db.commit()

    return SoloCheckoutResponse(checkout_url=checkout_url, session_id=session_id)
