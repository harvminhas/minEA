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
