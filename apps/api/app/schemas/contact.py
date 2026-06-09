from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

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
