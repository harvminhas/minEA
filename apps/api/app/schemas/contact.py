import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

ContactInterest = Literal["business", "demo", "onboarding", "other"]


class ContactInquiryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    company: str | None = Field(default=None, max_length=200)
    team_size: str | None = Field(default=None, max_length=100)
    interest: ContactInterest = "business"
    message: str = Field(min_length=1, max_length=5000)


class ContactInquiryRead(BaseModel):
    id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


BUSINESS_MIN_LICENCES = 5
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class BusinessPlanRequestCreate(BaseModel):
    """Business plan "Get started" form. Public: signed-out visitors can submit it too."""

    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    company: str = Field(min_length=1, max_length=200)
    licences: int = Field(ge=BUSINESS_MIN_LICENCES, le=100000)
    billing_period: Literal["monthly", "annual"]
    payment_method: Literal["card", "invoice"]
    message: str | None = Field(default=None, max_length=5000)
    org_slug: str | None = Field(default=None, max_length=200)
    source: str | None = Field(default=None, max_length=100)

    @field_validator("name", "company")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("required")
        return v

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: str) -> str:
        if not _EMAIL_RE.match(v.strip()):
            raise ValueError("enter a valid email")
        return v


class BusinessPlanRequestRead(BaseModel):
    id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
