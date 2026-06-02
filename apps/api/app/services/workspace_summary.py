"""Single-query workspace aggregates for the landing dashboard."""
from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.views_graph import CustomerJourney, Process, Product
from app.schemas.workspace_summary import WorkspaceSummaryRead

SYSTEM_TYPES = ("application", "solution", "technical_capability")


async def _count_objects(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    *,
    object_type: str | None = None,
    object_types: tuple[str, ...] | None = None,
) -> int:
    q = (
        select(func.count())
        .select_from(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    if object_type is not None:
        q = q.where(MinEAObject.type == object_type)
    elif object_types is not None:
        q = q.where(MinEAObject.type.in_(object_types))
    result = await db.execute(q)
    return int(result.scalar_one() or 0)


async def _count_table(
    db: AsyncSession,
    model: type[Product] | type[Process] | type[CustomerJourney],
    workspace_id: UUID,
    org_id: UUID,
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(model)
        .where(model.workspace_id == workspace_id, model.org_id == org_id)
    )
    return int(result.scalar_one() or 0)


async def fetch_workspace_summary(
    db: AsyncSession, workspace_id: UUID, org_id: UUID
) -> WorkspaceSummaryRead:
    (
        domain_count,
        capability_count,
        system_count,
        investment_count,
        product_count,
        process_count,
        journey_count,
    ) = await asyncio.gather(
        _count_objects(db, workspace_id, org_id, object_type="business_domain"),
        _count_objects(db, workspace_id, org_id, object_type="capability"),
        _count_objects(db, workspace_id, org_id, object_types=SYSTEM_TYPES),
        _count_objects(db, workspace_id, org_id, object_type="roadmap_item"),
        _count_table(db, Product, workspace_id, org_id),
        _count_table(db, Process, workspace_id, org_id),
        _count_table(db, CustomerJourney, workspace_id, org_id),
    )

    return WorkspaceSummaryRead(
        domain_count=domain_count,
        capability_count=capability_count,
        system_count=system_count,
        product_count=product_count,
        process_count=process_count,
        journey_count=journey_count,
        investment_count=investment_count,
        map_initialized=domain_count > 0,
    )
