"""Platform admin: set an org's plan by hand (Free / Starter / Business).

Orgs with a Stripe subscription are blocked (cancel in Stripe first), otherwise the next
Stripe event would overwrite the change. Hand-set plans get the pack limits, same as Stripe
(stripe_managed=True: Business = 10 licences). Every change writes a billing.manual_plan audit row.
"""
from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenancy import Org
from app.services.audit import log_audit
from app.services.plan_apply import apply_plan_to_org
from app.services.plan_features import normalize_plan

MANUAL_ACTION = "billing.manual_plan"
HAND_PLANS = ("free", "starter", "business")
MAX_REASON = 200


class ManualPlanError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


async def set_plan_by_hand(db: AsyncSession, org_slug: str, plan: str, *, reason: str, admin_email: str, admin_uid: str) -> dict:
    target = (plan or "").strip().lower()
    if target not in HAND_PLANS:
        raise ManualPlanError(422, "bad_plan", "Choose Free, Starter or Business.")
    org = (await db.execute(select(Org).where(Org.slug == org_slug).with_for_update())).scalar_one_or_none()
    if not org:
        raise ManualPlanError(404, "org_not_found", "Org not found.")
    if org.stripe_subscription_id:
        raise ManualPlanError(409, "stripe_subscription", "This org pays through Stripe. Cancel in Stripe first.")
    previous = normalize_plan(org.plan)
    if previous == target:
        raise ManualPlanError(409, "same_plan", f"Already on {target.title()}.")
    from app.services.tenancy import _set_rls_org

    await _set_rls_org(db, org.id)
    actor = (await db.execute(text("SELECT id FROM users WHERE firebase_uid = :uid"), {"uid": admin_uid})).scalar_one_or_none()
    await apply_plan_to_org(db, org.id, target, stripe_managed=True)
    note = (reason or "").strip()[:MAX_REASON]
    await log_audit(
        db,
        org_id=org.id,
        actor_user_id=actor,
        action=MANUAL_ACTION,
        target_type="org",
        target_id=org.id,
        metadata={"from": previous, "to": target, "reason": note, "actor_email": admin_email.strip().lower()},
    )
    await db.commit()
    return {"slug": org.slug, "plan": target, "previous": previous, "manual": {"by": admin_email.strip().lower(), "reason": note}}
