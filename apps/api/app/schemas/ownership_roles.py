"""Per-role owners: list, bulk assign / move / remove, and one record's editor."""
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

RoleKind = Literal["business_owner", "technical_owner", "support_team"]
SubjectType = Literal["team", "contact"]


class OwnerRef(BaseModel):
    type: SubjectType
    id: UUID


class RoleOwnerRead(BaseModel):
    team_id: UUID | None = None
    team_name: str | None = None
    contact_id: UUID | None = None
    contact_name: str | None = None
    # No named contact on this role: the team's lead is shown instead.
    contact_is_lead: bool = False


class ObjectOwnershipRead(BaseModel):
    object_id: UUID
    name: str
    type: str
    category: str | None = None  # applications only
    roles: dict[str, RoleOwnerRead] = Field(default_factory=dict)
    legacy_owner: str | None = None
    owned: bool


class OwnershipListResponse(BaseModel):
    items: list[ObjectOwnershipRead]
    unowned_count: int


class OwnershipBulkRequest(BaseModel):
    action: Literal["assign", "move", "remove"]
    object_ids: list[UUID] = Field(..., min_length=1, max_length=2000)
    # assign: required. move / remove: optional, omitted = every role the owner holds on those records.
    role: RoleKind | None = None
    owner: OwnerRef
    target: OwnerRef | None = None

    @model_validator(mode="after")
    def _check(self) -> "OwnershipBulkRequest":
        if self.action == "assign" and not self.role:
            raise ValueError("Pick a role to assign")
        if self.action == "move":
            if not self.target:
                raise ValueError("Pick who to move to")
            if self.target.type == self.owner.type and self.target.id == self.owner.id:
                raise ValueError("Pick a different owner to move to")
        return self


class OwnershipBulkResponse(BaseModel):
    changed: int


class RoleOwnerWrite(BaseModel):
    team_id: UUID | None = None
    contact_id: UUID | None = None


class ObjectOwnershipWrite(BaseModel):
    """Every role at once; a role left out or null is cleared."""

    roles: dict[RoleKind, RoleOwnerWrite | None] = Field(default_factory=dict)
