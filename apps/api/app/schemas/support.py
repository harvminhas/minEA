from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

SupportTopic = Literal["billing", "bug", "other"]


class SupportRequestCreate(BaseModel):
    topic: SupportTopic = "other"
    message: str = Field(min_length=1, max_length=5000)
    checkout_session_id: str | None = Field(default=None, max_length=255)
    source: str | None = Field(default=None, max_length=100)


class SupportRequestRead(BaseModel):
    id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class CheckoutPendingRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)


class CheckoutPendingResponse(BaseModel):
    # active: the plan is already set; waiting: recorded, under 5 minutes; alerted: owner emailed
    # (now or earlier for this session).
    status: Literal["active", "waiting", "alerted"]
