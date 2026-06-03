from datetime import datetime

from pydantic import BaseModel


class WorkspaceSummaryRead(BaseModel):
    """Aggregated workspace metrics for the landing dashboard."""

    domain_count: int
    capability_count: int
    system_count: int
    product_count: int
    process_count: int
    journey_count: int
    investment_count: int
    map_initialized: bool
    incomplete_domain_count: int = 0
    capabilities_without_system_count: int = 0
    products_without_capabilities_count: int = 0


class WorkspaceSnapshotResponse(BaseModel):
    """Snapshot envelope — serve last good metrics while `stale` / `rebuilding`."""

    version: int
    built_at: datetime | None = None
    stale: bool = False
    rebuilding: bool = False
    metrics: WorkspaceSummaryRead
