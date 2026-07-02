from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DataLinkRead(BaseModel):
    id: UUID
    entity_kind: str
    entity_id: UUID
    entity_name: str
    link_kind: str
    role_tag: str | None = None
    subtitle: str | None = None


class DataLinkCreate(BaseModel):
    entity_kind: str = Field(
        ...,
        pattern=r"^(data_domain|data_store|data_object|application|integration_flow|capability|process|business_domain)$",
    )
    entity_id: UUID
    link_kind: str = Field(
        ...,
        pattern=r"^(governed_by|stored_in|managed_by|moved_by|uses|reads_writes|related|stores|hosts|source_target|governs|system_of_record)$",
    )
    role_tag: str | None = None


class DataObjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    classification: str | None = None
    sensitivity: str | None = None
    data_domain_id: UUID | None = None
    owner_system_id: UUID | None = None


class DataStoreUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    store_type: str | None = None
    technology: str | None = None
    health: str | None = None
    data_domain_id: UUID | None = None


class DataDomainUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    classification: str | None = None
    owning_team: str | None = None
    steward_name: str | None = None
    steward_email: str | None = None
    capability_domain_id: UUID | None = None


class DataObjectDetail(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    description: str | None
    classification: str | None = None
    sensitivity: str | None = None
    data_domain_id: UUID | None = None
    data_domain_name: str | None = None
    owner_system_id: UUID | None = None
    owner_system_name: str | None = None
    related_entities: list[DataLinkRead] = Field(default_factory=list)
    links: list[DataLinkRead] = Field(default_factory=list)
    inferred_capabilities: list[DataLinkRead] = Field(default_factory=list)
    inferred_processes: list[DataLinkRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DataStoreDetail(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    description: str | None
    store_type: str | None = None
    technology: str | None = None
    health: str | None = None
    data_domain_id: UUID | None = None
    data_domain_name: str | None = None
    links: list[DataLinkRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DataDomainDetail(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    description: str | None
    classification: str | None = None
    owning_team: str | None = None
    steward_name: str | None = None
    steward_email: str | None = None
    capability_domain_id: UUID | None = None
    capability_domain_name: str | None = None
    links: list[DataLinkRead] = Field(default_factory=list)
    inferred_summary: list[str] = Field(default_factory=list)
    domain_rollup: dict[str, list[dict[str, str]]] | None = None
    created_at: datetime
    updated_at: datetime


class DataObjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    classification: str | None = "core"
    sensitivity: str | None = None
    data_domain_id: UUID | None = None


class DataStoreCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    store_type: str | None = "relational_db"
    technology: str | None = None
    health: str | None = "healthy"


class DataDomainCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    classification: str | None = None
    owning_team: str | None = None
    steward_name: str | None = None
    steward_email: str | None = None


class FlowEndpointSystemRead(BaseModel):
    id: UUID
    name: str
    category: str
    vendor: str | None = None
    entity_count: int = 0
    connection_label: str | None = None


class FlowEndpointEntityRead(BaseModel):
    id: UUID
    name: str
    system_id: UUID | None = None
    system_name: str | None = None
    classification: str | None = None
    sensitivity: str | None = None
    registered: bool = False


class FlowEndpointCatalog(BaseModel):
    systems: list[FlowEndpointSystemRead] = Field(default_factory=list)
    entities: list[FlowEndpointEntityRead] = Field(default_factory=list)
