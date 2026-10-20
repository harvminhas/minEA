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


class WorkspaceMemberRead(BaseModel):
    user_id: UUID
    email: str
    full_name: str | None
    role: str
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InviteWorkspaceIn(BaseModel):
    slug: str = Field(..., min_length=1, max_length=63)
    role: str = Field(..., pattern=r"^(admin|member|viewer)$")


class InviteCreate(BaseModel):
    """One invite per email: chosen workspaces with a role each, and/or org admin.
    The older single-invite shape (email + role [+ workspace_slug]) is still accepted."""

    emails: list[str] = Field(default_factory=list, max_length=50)
    workspaces: list[InviteWorkspaceIn] = Field(default_factory=list, max_length=200)
    org_admin: bool = False
    email: str | None = Field(default=None, min_length=3)
    role: str | None = Field(default=None, pattern=r"^(admin|member|viewer)$")
    workspace_slug: str | None = Field(default=None, min_length=2, max_length=63)


class InviteAccess(BaseModel):
    slug: str
    name: str
    role: str


class InviteIssued(BaseModel):
    id: UUID
    email: str
    invite_url: str
    email_sent: bool
    merged: bool
    expires_at: datetime
    org_admin: bool
    workspaces: list[InviteAccess]


class InvitesCreated(BaseModel):
    invites: list[InviteIssued]
    # First invite's link, for clients that read the single-invite response.
    invite_url: str | None = None


class InviteLink(BaseModel):
    invite_url: str


class PendingAccess(BaseModel):
    id: UUID
    org_admin: bool
    workspaces: list[InviteAccess]
    expires_at: datetime
    email_sent_at: datetime | None = None
    can_copy: bool
    can_manage: bool


class PersonRow(BaseModel):
    email: str
    user_id: UUID | None = None
    full_name: str | None = None
    org_role: str | None = None  # None: invited, not in the org yet
    workspaces: list[InviteAccess] = Field(default_factory=list)
    invite: PendingAccess | None = None


class ManageableWorkspace(BaseModel):
    slug: str
    name: str


class PeopleResponse(BaseModel):
    people: list[PersonRow]
    workspaces: list[ManageableWorkspace]
    can_invite_org_admins: bool


class MemberWorkspacesSet(BaseModel):
    workspaces: list[InviteWorkspaceIn] = Field(default_factory=list, max_length=200)


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
    email_sent: bool | None = None


class InvitePreview(BaseModel):
    org_name: str
    org_slug: str
    email: str
    role: str
    workspace_slug: str | None
    status: str
    expired: bool
    consumed: bool
    workspaces: list[InviteAccess] = Field(default_factory=list)
    org_admin: bool = False
    inviter: str | None = None


class OwnerTransfer(BaseModel):
    new_owner_user_id: UUID
