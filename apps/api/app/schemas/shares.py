from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ShareCreate(BaseModel):
    resource_type: str = Field(
        ...,
        pattern=r"^(view|roadmap|object|capability_map|capability_domain)$",
    )
    resource_key: str | None = None
    resource_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=255)
    expires_in_days: int = Field(default=30, ge=1, le=365)

    model_config = ConfigDict(str_strip_whitespace=True)


class ShareRead(BaseModel):
    id: UUID
    resource_type: str
    resource_key: str | None
    resource_id: UUID | None
    title: str
    status: str
    expires_at: datetime
    created_at: datetime
    share_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ShareCreated(ShareRead):
    token: str


class SharePreview(BaseModel):
    org_name: str
    org_slug: str
    workspace_name: str
    workspace_slug: str
    resource_type: str
    resource_key: str | None
    resource_id: UUID | None
    title: str
    status: str
    expired: bool
    revoked: bool
    shared_by_name: str | None = None
    expires_at: datetime | None = None
