"""Org billing — Stripe Checkout for Solo upgrades."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.models.shares import ShareLink
from app.schemas.billing import BillingStatusResponse, SoloCheckoutResponse
from app.services.authorization import get_org_limit
from app.services.plan_features import (
    can_create_own_workspace,
    can_create_share_link,
    normalize_plan,
    plan_max_active_share_links,
    plan_max_own_workspaces,
)
from app.services.stripe_billing import create_solo_checkout_session, stripe_configured
from app.services.tenancy import TenancyContext, get_org_context
from app.utils.time import utc_now

router = APIRouter(prefix="/orgs/{org_slug}/billing", tags=["billing"])


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

    return BillingStatusResponse(
        plan=plan,
        stripe_configured=stripe_configured(),
        can_upgrade_solo=plan == "free" and stripe_configured(),
        has_subscription=bool(ctx.org.stripe_subscription_id),
        own_workspace_count=owned_count,
        own_workspace_limit=workspace_limit,
        can_create_own_workspace=can_create_own_workspace(plan, owned_count),
        active_share_link_count=share_count,
        active_share_link_limit=share_limit,
        can_create_share_link=can_create_share_link(plan, share_count),
    )


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
