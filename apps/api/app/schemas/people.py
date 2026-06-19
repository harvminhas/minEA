from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


PeopleRoleKind = str  # owner | performer | steward
AssignmentKind = str  # owner | performer
AccountabilityEntityKind = str  # product | capability | business_domain | process | application
LinkKind = str  # owns | performs | stewards


class PeopleRoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    role_kind: str = Field(default="owner", pattern=r"^(owner|performer|steward)$")
    description: str | None = None


class PeopleRoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role_kind: str | None = Field(default=None, pattern=r"^(owner|performer|steward)$")
    description: str | None = None


class PeopleRoleRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    role_kind: str
    description: str | None
    team_count: int = 0
    created_at: datetime
    updated_at: datetime


class TeamRoleAssignmentRead(BaseModel):
    id: UUID
    team_id: UUID
    team_name: str
    people_role_id: UUID
    people_role_name: str
    assignee_name: str | None
    assignee_email: str | None
    assignment_kind: str


class TeamRoleOnTeamRead(BaseModel):
    id: UUID
    people_role_id: UUID
    role_name: str
    role_kind: str
    assignee_name: str | None
    assignee_email: str | None
    assignment_kind: str


class TeamUsingRoleRead(BaseModel):
    team_id: UUID
    team_name: str
    assignee_name: str | None
    assignee_email: str | None
    assignment_kind: str


class AccountabilityRead(BaseModel):
    id: UUID
    entity_kind: str
    entity_id: UUID
    entity_name: str
    link_kind: str
    subtitle: str | None = None


class PeopleRoleDetail(PeopleRoleRead):
    teams: list[TeamUsingRoleRead] = Field(default_factory=list)
    accountabilities: list[AccountabilityRead] = Field(default_factory=list)


class PeopleRoleListResponse(BaseModel):
    items: list[PeopleRoleRead]
    total: int


class TeamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    lead_name: str | None = None
    lead_email: str | None = None


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    lead_name: str | None = None
    lead_email: str | None = None


class TeamRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    description: str | None
    lead_name: str | None
    lead_email: str | None
    role_count: int = 0
    created_at: datetime
    updated_at: datetime


class TeamDetail(TeamRead):
    roles: list[TeamRoleOnTeamRead] = Field(default_factory=list)
    accountabilities: list[AccountabilityRead] = Field(default_factory=list)


class TeamListResponse(BaseModel):
    items: list[TeamRead]
    total: int


class TeamRoleAssignmentCreate(BaseModel):
    people_role_id: UUID
    assignee_name: str | None = None
    assignee_email: str | None = None
    assignment_kind: str = Field(default="performer", pattern=r"^(owner|performer)$")


class TeamRoleAssignmentUpdate(BaseModel):
    assignee_name: str | None = None
    assignee_email: str | None = None
    assignment_kind: str | None = Field(default=None, pattern=r"^(owner|performer)$")


class AddRoleToTeamCreate(BaseModel):
    team_id: UUID
    assignee_name: str | None = None
    assignee_email: str | None = None
    assignment_kind: str = Field(default="performer", pattern=r"^(owner|performer)$")


class AccountabilityCreate(BaseModel):
    entity_kind: str = Field(
        ...,
        pattern=r"^(product|capability|business_domain|process|application|data_domain|data_store)$",
    )
    entity_id: UUID
    link_kind: str = Field(
        ...,
        pattern=r"^(owns|performs|approves|informed|stewards|manages)$",
    )


class AccountabilityUpdate(BaseModel):
    link_kind: str = Field(
        ...,
        pattern=r"^(owns|performs|approves|informed|stewards|manages)$",
    )


class PeopleContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str | None = None
    team_id: UUID | None = None


class PeopleContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = None
    team_id: UUID | None = None


class PeopleContactRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    email: str | None
    team_id: UUID | None
    team_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ContactAssignmentRead(BaseModel):
    entity_kind: str
    entity_id: UUID
    entity_name: str
    subtitle: str | None = None


class PeopleContactDetail(PeopleContactRead):
    assignments: list[ContactAssignmentRead] = Field(default_factory=list)


class PeopleContactListResponse(BaseModel):
    items: list[PeopleContactRead]
    total: int
