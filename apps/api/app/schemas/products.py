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


class ProductRead(BaseModel):
    id: UUID
    workspace_id: UUID
    org_id: UUID
    name: str
    product_line: str | None
    lifecycle: str
    owner: str | None
    description: str | None
    capability_count: int = 0
    system_count: int = 0
    api_count: int = 0
    data_store_count: int = 0
    maturity_indicator: str | None = None
    capability_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

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
