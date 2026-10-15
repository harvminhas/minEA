"""Platform admin (superuser): Users list and Erase user. Every endpoint checks the superuser server-side."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext
from app.database import get_db
from app.routers.platform_catalog import require_platform_admin
from app.services import user_erase as ue

router = APIRouter(prefix="/platform/admin", tags=["platform-admin"])


class EraseRequest(BaseModel):
    confirm_email: str
    acknowledge_subscriptions: bool = False
    # Erase every account with this email (default), or only the one picked.
    all_accounts: bool = True


def _fail(err: ue.EraseError) -> HTTPException:
    return HTTPException(status_code=err.status, detail={"code": err.code, "message": err.message})


@router.get("/users")
async def users(q: str = "", sort: str = "newest", _admin: AuthContext = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    rows = await ue.list_users(db, q=q, sort=sort)
    return {"users": rows}


@router.get("/users/{user_id}/erase-preview")
async def erase_preview(user_id: UUID, all_accounts: bool = True, admin: AuthContext = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        plan = await ue.plan_erase(db, user_id, all_accounts=all_accounts)
    except ue.EraseError as err:
        raise _fail(err) from None
    body = plan.as_dict()
    target = (plan.user.get("email") or "").strip().lower()
    body["is_self"] = target == admin.email.strip().lower() or admin.firebase_uid in plan.firebase_uids
    body["is_platform_admin"] = target in ue.tc.platform_admin_emails()
    body["all_accounts"] = all_accounts
    body["accounts_with_email"] = len(await ue._sibling_accounts(db, target, False)) if target else 1
    return body


@router.post("/users/{user_id}/erase")
async def erase(user_id: UUID, body: EraseRequest, admin: AuthContext = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await ue.execute_erase(
            db, user_id,
            admin_email=admin.email, admin_uid=admin.firebase_uid,
            confirm_email=body.confirm_email, acknowledge_subscriptions=body.acknowledge_subscriptions,
            all_accounts=body.all_accounts,
        )
    except ue.EraseError as err:
        raise _fail(err) from None
