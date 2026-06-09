"""Public contact form — no auth required."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.contact import ContactInquiry
from app.schemas.contact import ContactInquiryCreate, ContactInquiryRead

router = APIRouter(prefix="/contact", tags=["contact"])


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
