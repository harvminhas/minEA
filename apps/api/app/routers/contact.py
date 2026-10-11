"""Public forms — no auth required."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_optional_auth_context
from app.database import get_db
from app.models.tenancy import User
from app.models.contact import BusinessPlanRequest, ContactInquiry
from app.schemas.contact import (
    BusinessPlanRequestCreate,
    BusinessPlanRequestRead,
    ContactInquiryCreate,
    ContactInquiryRead,
)
from app.services.business_request_email import send_business_request_email
from app.services.email_sender import Submitter, submitter_for

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.post("", response_model=ContactInquiryRead, status_code=status.HTTP_201_CREATED)
async def submit_contact_inquiry(
    body: ContactInquiryCreate,
    db: AsyncSession = Depends(get_db),
) -> ContactInquiry:
    inquiry = ContactInquiry(
        name=body.name.strip(),
        email=body.email.strip().lower(),
        company=body.company.strip() if body.company else None,
        team_size=body.team_size.strip() if body.team_size else None,
        interest=body.interest,
        message=body.message.strip(),
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    return inquiry


@router.post(
    "/business",
    response_model=BusinessPlanRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_business_request(
    body: BusinessPlanRequestCreate,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext | None = Depends(get_optional_auth_context),
) -> BusinessPlanRequest:
    """Business plan "Get started" form. Public; a signed-in caller's identity (from the verified
    token, never the form) is shown in the notification. Stores the request; emails it when
    Resend is set up."""
    req = BusinessPlanRequest(
        name=body.name.strip(),
        email=body.email.strip().lower(),
        company=body.company.strip(),
        licences=body.licences,
        billing_period=body.billing_period,
        payment_method=body.payment_method,
        message=_clean(body.message),
        org_slug=_clean(body.org_slug),
        source=_clean(body.source),
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    submitter = await _business_submitter(db, auth if isinstance(auth, AuthContext) else None, req)
    background.add_task(send_business_request_email, req, submitter)
    return req


async def _business_submitter(db: AsyncSession, auth: AuthContext | None, req: BusinessPlanRequest) -> Submitter:
    anonymous = Submitter(
        signed_in=False,
        submitted_at=req.created_at,
        form_fields=[("Name (form)", req.name), ("Email (form)", req.email), ("Company (form)", req.company)],
    )
    if auth is None:
        return anonymous
    try:
        user = (await db.execute(select(User).where(User.firebase_uid == auth.firebase_uid))).scalar_one_or_none()
        if user is None:
            return anonymous
        org, role = None, None
        if req.org_slug:
            from app.services.tenancy import _resolve_org_membership

            try:
                org, role = await _resolve_org_membership(db, user.id, req.org_slug)
            except HTTPException:
                org, role = None, "not a member of " + req.org_slug
        return submitter_for(user, org, role, req.created_at)
    except Exception:
        logger.exception("Could not resolve the Business request submitter")
        return anonymous
