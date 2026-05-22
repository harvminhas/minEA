from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    template_id: str | None = None
    biz_layer_term: str = "Capability"
    app_layer_term: str = "Application"
    constraint_mode: str = "guided"

    model_config = ConfigDict(str_strip_whitespace=True)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    biz_layer_term: str | None = None
    app_layer_term: str | None = None
    constraint_mode: str | None = None


class WorkspaceRead(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    template_id: str | None
    biz_layer_term: str
    app_layer_term: str
    constraint_mode: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
