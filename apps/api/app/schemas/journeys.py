from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.ownership import OwnershipFields


class JourneyStepCreate(OwnershipFields, BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    position: int = 0
    channel: str | None = None
    goal: str | None = None
    pain_points: str | None = None
    owner: str | None = None
    ai_opportunities: str | None = None
    sentiment_friction: str | None = None
    process_ids: list[UUID] = Field(default_factory=list)
    system_ids: list[UUID] = Field(default_factory=list)


class JourneyStepRead(OwnershipFields, BaseModel):
    id: UUID
    title: str
    position: int
    channel: str | None = None
    goal: str | None = None
    pain_points: str | None = None
    owner: str | None = None
    ai_opportunities: str | None = None
    sentiment_friction: str | None = None
    process_ids: list[UUID] = Field(default_factory=list)
    system_ids: list[UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class JourneyCreate(OwnershipFields, BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    owner: str | None = None
    status: str = Field(default="draft")
    customer_segment: str | None = None
    description: str | None = None
    canvas_layout: dict | None = None
    graph_edges: list[dict] | None = None
    steps: list[JourneyStepCreate] = Field(default_factory=list)


class JourneyUpdate(OwnershipFields, BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    owner: str | None = None
    status: str | None = None
    customer_segment: str | None = None
    description: str | None = None
    canvas_layout: dict | None = None
    graph_edges: list[dict] | None = None
    steps: list[JourneyStepCreate] | None = None


class JourneyRead(OwnershipFields, BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    owner: str | None
    status: str
    customer_segment: str | None
    description: str | None
    step_count: int = 0
    process_count: int = 0
    steps: list[JourneyStepRead] = Field(default_factory=list)
    canvas_layout: dict | None = None
    graph_edges: list[dict] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JourneyListResponse(BaseModel):
    items: list[JourneyRead]
    total: int


class DerivedSystemsResponse(BaseModel):
    items: list[dict]
