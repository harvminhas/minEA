from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    position: int = 0
    owner: str | None = None
    cycle_time_target: float | None = None
    typical_duration: str | None = None
    transition_condition: str | None = None
    transition_trigger: str | None = None
    transition_handoff: str | None = None
    capability_ids: list[UUID] = Field(default_factory=list)


class StageRead(BaseModel):
    id: UUID
    name: str
    position: int
    owner: str | None
    cycle_time_target: float | None
    typical_duration: str | None
    transition_condition: str | None = None
    transition_trigger: str | None = None
    transition_handoff: str | None = None
    capability_ids: list[UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ProcessCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    owner: str | None = None
    status: str = Field(default="draft")
    description: str | None = None
    trigger_event: str | None = None
    value_delivered: str | None = None
    canvas_layout: dict | None = None
    graph_edges: list[dict] | None = None
    stages: list[StageCreate] = Field(default_factory=list)


class ProcessUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    owner: str | None = None
    status: str | None = None
    description: str | None = None
    trigger_event: str | None = None
    value_delivered: str | None = None
    canvas_layout: dict | None = None
    graph_edges: list[dict] | None = None
    stages: list[StageCreate] | None = None


class ProcessRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    owner: str | None
    status: str
    description: str | None
    trigger_event: str | None
    value_delivered: str | None
    stage_count: int = 0
    capability_count: int = 0
    stages: list[StageRead] = Field(default_factory=list)
    canvas_layout: dict | None = None
    graph_edges: list[dict] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProcessListResponse(BaseModel):
    items: list[ProcessRead]
    total: int
