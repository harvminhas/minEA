"""Public forms — no auth required."""

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.contact import BusinessPlanRequest, ContactInquiry
from app.schemas.contact import (
    BusinessPlanRequestCreate,
    BusinessPlanRequestRead,
    ContactInquiryCreate,
    ContactInquiryRead,
)
from app.services.business_request_email import send_business_request_email

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
) -> BusinessPlanRequest:
    """Business plan "Get started" form. Stores the request; emails it when Resend is set up."""
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
    background.add_task(send_business_request_email, req)
    return req
