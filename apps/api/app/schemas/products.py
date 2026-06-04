from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    product_line: str | None = None
    lifecycle: str = Field(default="planned")
    owner: str | None = None
    description: str | None = None
    capability_ids: list[UUID] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    product_line: str | None = None
    lifecycle: str | None = None
    owner: str | None = None
    description: str | None = None
    capability_ids: list[UUID] | None = None
    graph_layout: dict | None = None


class ProductHealthDimensions(BaseModel):
    ops: str = "healthy"
    debt: str = "healthy"
    lifecycle: str = "healthy"
    ownership: str = "healthy"


class ProductTechDebtRemediation(BaseModel):
    roadmap_id: str
    roadmap_title: str


class ProductTechDebtItem(BaseModel):
    id: str
    name: str
    severity: str
    debt_type: str | None = None
    debt_type_label: str
    age_days: int
    affects_name: str
    affects_kind: str
    owner: str | None = None
    remediation: ProductTechDebtRemediation | None = None


class ProductRoadmapNextMilestone(BaseModel):
    title: str
    target_label: str


class ProductRoadmapItem(BaseModel):
    id: str
    name: str
    kind: str | None = None
    kind_label: str
    status: str
    status_label: str
    target_label: str
    owner: str | None = None
    milestone_strip: list[dict] = Field(default_factory=list)
    milestones_done: int = 0
    milestones_total: int = 0
    next_milestone: ProductRoadmapNextMilestone | None = None


class ProductIntegrationItem(BaseModel):
    id: str
    name: str
    kind: str


class ProductHistoryEntry(BaseModel):
    id: str
    actor_name: str
    action: str
    detail: str | None = None
    created_at: datetime


class ProductHistoryResponse(BaseModel):
    entries: list[ProductHistoryEntry]


class ProductRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    product_line: str | None
    lifecycle: str
    owner: str | None
    description: str | None
    updated_by_name: str | None = None
    capability_count: int = 0
    system_count: int = 0
    apis_provided_count: int = 0
    apis_consumed_count: int = 0
    events_produced_count: int = 0
    events_subscribed_count: int = 0
    flows_in_count: int = 0
    flows_out_count: int = 0
    data_store_count: int = 0
    maturity_indicator: str | None = None
    capability_ids: list[UUID] = Field(default_factory=list)
    graph_layout: dict | None = None
    created_at: datetime
    updated_at: datetime
    # Layer-1 portfolio cockpit signals
    annual_cost_total: float | None = None
    open_tech_debt_count: int = 0
    critical_tech_debt_count: int = 0
    roadmap_status: str | None = None
    roadmap_count: int = 0
    health_status: str = "no_data"
    health_factors: list[dict] = Field(default_factory=list)
    trend_direction: str = "stable"
    trend_label: str = "No recent changes"
    health_dimensions: ProductHealthDimensions | None = None
    tech_debt_items: list[ProductTechDebtItem] = Field(default_factory=list)
    roadmap_items: list[ProductRoadmapItem] = Field(default_factory=list)
    apis_provided: list[ProductIntegrationItem] = Field(default_factory=list)
    apis_consumed: list[ProductIntegrationItem] = Field(default_factory=list)
    events_produced: list[ProductIntegrationItem] = Field(default_factory=list)
    events_subscribed: list[ProductIntegrationItem] = Field(default_factory=list)
    flows_in: list[ProductIntegrationItem] = Field(default_factory=list)
    flows_out: list[ProductIntegrationItem] = Field(default_factory=list)
    data_stores: list[ProductIntegrationItem] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    items: list[ProductRead]
    total: int


class ProductGraphNode(BaseModel):
    id: str
    label: str
    type: str
    layer: int


class ProductGraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str


class ProductGraphResponse(BaseModel):
    nodes: list[ProductGraphNode]
    edges: list[ProductGraphEdge]
    graph_layout: dict | None = None
