from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

# All valid (relationship_type, from_type, to_type) triples.
# The API rejects any combination not in this set.
ALLOWED_TRIPLES: set[tuple[str, str, str]] = {
    # Business
    ("depends_on", "capability", "capability"),
    # Application
    ("part_of", "application", "application"),
    ("part_of", "application", "solution"),
    ("calls", "application", "application"),
    ("uses", "application", "technical_capability"),
    # Data
    ("contains", "data_store", "data_object"),
    # Integration
    ("connects", "integration_flow", "api"),
    ("connects", "integration_flow", "event"),
    ("routes", "message_broker", "event"),
    ("routes", "tool", "event"),
    ("hosts", "tool", "api"),
    ("carries", "tool", "integration_flow"),
    # Cross-layer: Business ← Application
    ("supported_by", "capability", "application"),
    ("supported_by", "capability", "solution"),
    ("supported_by", "capability", "technical_capability"),
    # Cross-layer: Integration ← Application
    ("exposes", "application", "api"),
    ("exposes", "component", "api"),
    ("publishes", "application", "event"),
    ("publishes", "component", "event"),
    ("publishes", "data_object", "event"),
    ("consumes", "application", "api"),
    ("subscribes", "application", "event"),
    ("subscribes", "component", "event"),
    ("reads", "application", "data_store"),
    ("writes", "application", "data_store"),
    ("owns", "application", "data_store"),
    ("creates", "application", "data_object"),
    ("updates", "application", "data_object"),
    ("reads", "application", "data_object"),
    ("owns", "application", "data_object"),
    ("belongs_to", "data_object", "data_domain"),
    ("belongs_to", "data_store", "data_domain"),
    ("belongs_to", "application", "data_domain"),
    ("exposes", "application", "tool"),
    ("part_of", "component", "application"),
    ("runs_on", "component", "tool"),
    ("runs_on", "component", "model"),
    ("runs_on", "component", "cloud_service"),
    ("built_on", "component", "cloud_service"),
    # Cross-layer: Infrastructure ← Application/Data
    ("runs_on", "application", "cloud_service"),
    ("runs_on", "data_store", "cloud_service"),
    ("runs_on", "message_broker", "cloud_service"),
    # Initiatives
    ("affects", "initiative", "capability"),
    ("affects", "initiative", "application"),
    ("affects", "tech_debt", "application"),
    ("affects", "tech_debt", "solution"),
    ("affects", "tech_debt", "technical_capability"),
    ("affects", "tech_debt", "component"),
    ("affects", "tech_debt", "api"),
    ("affects", "tech_debt", "event"),
    ("affects", "tech_debt", "integration_flow"),
    ("affects", "tech_debt", "tool"),
    ("affects", "tech_debt", "data_object"),
    ("affects", "tech_debt", "data_store"),
    ("affects", "tech_debt", "data_domain"),
    ("affects", "tech_debt", "cloud_service"),
    ("affects", "tech_debt", "model"),
    ("resolves", "roadmap_item", "tech_debt"),
    ("replaces", "application", "application"),
    # AI module
    ("uses_model", "agent", "model"),
    ("can_call", "agent", "tool"),
    ("supports", "agent", "capability"),
    ("escalates_to", "agent", "application"),
    ("accesses", "tool", "data_object"),
    ("connects_to", "tool", "application"),
}


class RelationshipCreate(BaseModel):
    type: str
    from_object_id: UUID
    from_type: str
    to_object_id: UUID
    to_type: str
    attributes: dict[str, Any] = {}

    @model_validator(mode="after")
    def validate_triple(self) -> "RelationshipCreate":
        triple = (self.type, self.from_type, self.to_type)
        if triple not in ALLOWED_TRIPLES:
            raise ValueError(
                f"Relationship ({self.type}, {self.from_type} → {self.to_type}) is not allowed. "
                "Check the allowed triples list."
            )
        return self


class RelationshipRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    type: str
    from_object_id: UUID
    from_type: str
    to_object_id: UUID
    to_type: str
    attributes: dict[str, Any]
    created_by: UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
