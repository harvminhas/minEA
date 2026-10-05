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
    ("part_of", "component", "application"),
    ("runs_on", "component", "tool"),
    ("runs_on", "component", "model"),
    ("runs_on", "component", "cloud_service"),
    ("built_on", "component", "cloud_service"),
    ("built_on", "application", "cloud_service"),
    ("built_on", "solution", "cloud_service"),
    ("built_on", "technical_capability", "cloud_service"),
    # Cross-layer: Infrastructure ← Application/Data (compute / hosting)
    ("runs_on", "application", "cloud_service"),
    ("runs_on", "solution", "cloud_service"),
    ("runs_on", "technical_capability", "cloud_service"),
    ("runs_on", "application", "model"),
    ("runs_on", "solution", "model"),
    ("runs_on", "technical_capability", "model"),
    ("runs_on", "data_store", "cloud_service"),
    ("runs_on", "message_broker", "cloud_service"),
    # Roadmaps. "initiative" is not an object type.
    ("affects", "roadmap_item", "application"),
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
    ("runs_on", "model", "model"),
    ("runs_on", "model", "cloud_service"),
    ("runs_on", "cloud_service", "model"),
    ("runs_on", "cloud_service", "cloud_service"),
    ("located_at", "model", "location"),
    ("located_at", "cloud_service", "location"),
    ("located_at", "application", "location"),
    ("uses", "application", "integration_flow"),
}

_FLOW_ENDS = ("application", "solution", "technical_capability", "cloud_service", "external_party")
ALLOWED_TRIPLES |= {("sends_data_to", source, target) for source in _FLOW_ENDS for target in _FLOW_ENDS}

# App-ish ends: applications, solutions, and technical capabilities.
_APPISH = ("application", "solution", "technical_capability")
ALLOWED_TRIPLES |= {("depends_on", source, target) for source in _APPISH for target in _APPISH}

_NOT_A_HOST = {"application", "solution", "technical_capability", "component"}
HOSTING_ON_APPLICATION = (
    "Applications can't run on applications. Use Depends on, or pick a Platform or Server."
)


def _copy_application_links(alias: str) -> None:
    """Give solutions and technical capabilities the same links an application has."""
    copied: set[tuple[str, str, str]] = set()
    for rel_type, source, target in list(ALLOWED_TRIPLES):
        if "process" in (source, target):
            continue
        if source == "application":
            other = alias if target == "application" else target
            copied.add((rel_type, alias, other))
            if target == "application":
                copied.add((rel_type, alias, "application"))
                copied.add((rel_type, "application", alias))
        elif target == "application" and source != alias:
            copied.add((rel_type, source, alias))
    ALLOWED_TRIPLES.update(copied)


_copy_application_links("solution")
_copy_application_links("technical_capability")

_FLOW_HOW = {"api", "file", "manual", "integration_tool"}
_FLOW_FREQUENCY = {"realtime", "daily", "ad_hoc"}


def relationship_rejection(rel_type: str, from_type: str, to_type: str) -> str | None:
    """None when the triple may be stored. Otherwise the 422 detail."""
    if (rel_type, from_type, to_type) in ALLOWED_TRIPLES:
        return None
    if rel_type in {"runs_on", "built_on"} and to_type in _NOT_A_HOST:
        return HOSTING_ON_APPLICATION
    return (
        f"Relationship ({rel_type}, {from_type} → {to_type}) is not allowed. "
        "Check the allowed triples list."
    )


def triple_allowed(rel_type: str, from_type: str, to_type: str) -> bool:
    return relationship_rejection(rel_type, from_type, to_type) is None


def validate_flow_attributes(rel_type: str, attributes: dict[str, Any] | None) -> None:
    if rel_type != "sends_data_to":
        return
    attrs = attributes or {}
    how = attrs.get("how")
    frequency = attrs.get("frequency")
    if how is not None and how not in _FLOW_HOW:
        raise ValueError("how must be api, file, manual, or integration_tool.")
    if frequency is not None and frequency not in _FLOW_FREQUENCY:
        raise ValueError("frequency must be realtime, daily, or ad_hoc.")


class RelationshipCreate(BaseModel):
    type: str
    from_object_id: UUID
    from_type: str
    to_object_id: UUID
    to_type: str
    attributes: dict[str, Any] = {}

    @model_validator(mode="after")
    def validate_triple(self) -> "RelationshipCreate":
        message = relationship_rejection(self.type, self.from_type, self.to_type)
        if message:
            raise ValueError(message)
        validate_flow_attributes(self.type, self.attributes)
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
