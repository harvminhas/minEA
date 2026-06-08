from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=2, max_length=63, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    template_id: str | None = None
    biz_layer_term: str = "Capability"
    app_layer_term: str = "Application"
    constraint_mode: str = "guided"
    source_workspace_slug: str | None = Field(
        default=None,
        description="When set with copy_layers, deep-clone content from this workspace into the new one.",
    )
    copy_layers: list[str] | None = Field(
        default=None,
        description="Repository layer ids to copy (strategy, business, application, integration, data, technology, people).",
    )

    model_config = ConfigDict(str_strip_whitespace=True)

    @model_validator(mode="after")
    def validate_copy_options(self) -> "WorkspaceCreate":
        if self.copy_layers and not self.source_workspace_slug:
            raise ValueError("source_workspace_slug is required when copy_layers is set")
        if self.source_workspace_slug and not self.copy_layers:
            raise ValueError("copy_layers is required when source_workspace_slug is set")
        return self


class WorkspaceCopyPreviewLayer(BaseModel):
    id: str
    label: str
    subtitle: str
    count: int


class WorkspaceCopyPreview(BaseModel):
    layers: list[WorkspaceCopyPreviewLayer]


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    biz_layer_term: str | None = None
    app_layer_term: str | None = None
    constraint_mode: str | None = None


class WorkspaceRead(BaseModel):
    id: UUID
    org_id: UUID
    slug: str
    name: str
    template_id: str | None
    biz_layer_term: str
    app_layer_term: str
    constraint_mode: str
    role: str | None = None  # caller's effective workspace role
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
