from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

VALID_TYPES = {
    "capability", "value_stream",
    "application", "solution", "technical_capability", "agent",
    "data_object", "data_store",
    "api", "event", "integration_flow", "message_broker", "tool",
    "cloud_service", "model",
}

VALID_STATUSES = {
    "planned", "active", "retiring", "retired", "deprecated", "under_evaluation"
}


class ObjectCreate(BaseModel):
    workspace_id: UUID
    type: str = Field(..., description="One of the 15 valid object types")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    owner: str | None = None
    status: str | None = None
    tags: list[str] = Field(default_factory=list)
    external_id: str | None = None
    source: str = "user"
    properties: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(str_strip_whitespace=True)

    def model_post_init(self, __context: Any) -> None:
        if self.type not in VALID_TYPES:
            raise ValueError(f"Invalid type '{self.type}'. Must be one of: {sorted(VALID_TYPES)}")
        if self.status and self.status not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{self.status}'.")


class ObjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    owner: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    properties: dict[str, Any] | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ObjectRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    type: str
    name: str
    description: str | None
    owner: str | None
    status: str | None
    tags: list[str]
    external_id: str | None
    source: str | None
    confidence: float | None
    properties: dict[str, Any]
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ObjectListResponse(BaseModel):
    items: list[ObjectRead]
    total: int
    page: int
    page_size: int
