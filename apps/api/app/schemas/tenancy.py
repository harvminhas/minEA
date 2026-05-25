from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrgCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=2, max_length=63, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    workspace_name: str = Field(default="Default", min_length=1, max_length=255)
    workspace_slug: str = Field(default="default", min_length=2, max_length=63, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

    model_config = ConfigDict(str_strip_whitespace=True)


class OrgRead(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrgMemberRead(BaseModel):
    user_id: UUID
    email: str
    full_name: str | None
    role: str
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InviteCreate(BaseModel):
    email: str = Field(..., min_length=3)
    role: str = Field(..., pattern=r"^(admin|member|viewer)$")
    workspace_slug: str | None = Field(default=None, min_length=2, max_length=63)


class InviteRead(BaseModel):
    id: UUID
    email: str
    role: str
    workspace_id: UUID | None
    status: str
    expires_at: datetime
    consumed_at: datetime | None
    created_at: datetime
    invite_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class InviteCreated(BaseModel):
    id: UUID
    email: str
    role: str
    workspace_id: UUID | None
    status: str
    expires_at: datetime
    invite_url: str
    token: str


class InvitePreview(BaseModel):
    org_name: str
    org_slug: str
    email: str
    role: str
    workspace_slug: str | None
    status: str
    expired: bool
    consumed: bool


class OwnerTransfer(BaseModel):
    new_owner_user_id: UUID
