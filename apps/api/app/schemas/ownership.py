"""Pydantic fields for team owner + point of contact."""
from pydantic import BaseModel, field_validator


class OwnershipFields(BaseModel):
    owner_team_id: str | None = None
    owner_team_name: str | None = None
    point_of_contact_id: str | None = None
    point_of_contact_name: str | None = None

    @field_validator("owner_team_id", "point_of_contact_id", mode="before")
    @classmethod
    def coerce_uuid_fields(cls, value: object) -> str | None:
        if value is None:
            return None
        return str(value)
