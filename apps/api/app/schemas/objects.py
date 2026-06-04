from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.products import ProductTechDebtItem

VALID_TYPES = {
    "business_domain", "capability", "value_stream", "roadmap_item",
    "application", "solution", "technical_capability", "component", "agent",
    "data_object", "data_store", "data_domain",
    "api", "event", "integration_flow", "message_broker", "tool",
    "cloud_service", "model", "tech_debt",
}

VALID_STATUSES = {
    "planned", "active", "retiring", "retired", "deprecated", "under_evaluation"
}


class ObjectCreate(BaseModel):
    type: str = Field(..., description="One of the valid object types")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    owner: str | None = None
    status: str | None = None
    tags: list[str] = Field(default_factory=list)
    external_id: str | None = None
    source: str = "user"
    properties: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(str_strip_whitespace=True)

    def model_post_init(self, __context: Any) -> None:
        if self.type not in VALID_TYPES:
            raise ValueError(f"Invalid type '{self.type}'. Must be one of: {sorted(VALID_TYPES)}")
        if self.status and self.status not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{self.status}'.")


class ObjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    owner: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    properties: dict[str, Any] | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ObjectHistoryEntry(BaseModel):
    id: str
    actor_name: str
    action: str
    detail: str | None = None
    created_at: datetime


class ObjectHistoryResponse(BaseModel):
    entries: list[ObjectHistoryEntry]


class ObjectTechDebtRollupProduct(BaseModel):
    id: str
    name: str


class ObjectTechDebtRemediationRef(BaseModel):
    roadmap_id: str
    roadmap_title: str


class ObjectRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    type: str
    name: str
    description: str | None
    owner: str | None
    status: str | None
    tags: list[str]
    external_id: str | None
    source: str | None
    confidence: float | None
    properties: dict[str, Any]
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
    # Populated for application / solution / technical_capability
    updated_by_name: str | None = None
    capability_count: int = 0
    apis_provided_count: int = 0
    apis_consumed_count: int = 0
    data_store_count: int = 0
    open_tech_debt_count: int = 0
    tech_debt_rollup_products: list[ObjectTechDebtRollupProduct] = Field(default_factory=list)
    tech_debt_remediation: ObjectTechDebtRemediationRef | None = None
    # Populated for data_object / data_store / data_domain cards
    data_domain_name: str | None = None
    system_of_record_name: str | None = None
    hosting_system_name: str | None = None
    governed_entity_count: int = 0
    governed_store_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ObjectTechDebtSummary(BaseModel):
    open_count: int = 0
    items: list[ProductTechDebtItem] = Field(default_factory=list)
    rollup_products: list[ObjectTechDebtRollupProduct] = Field(default_factory=list)


class ObjectListResponse(BaseModel):
    items: list[ObjectRead]
    total: int
    page: int
    page_size: int
