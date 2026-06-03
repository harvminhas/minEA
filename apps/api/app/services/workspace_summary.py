"""Single-query workspace aggregates for the landing dashboard."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import CustomerJourney, Process, Product
from app.schemas.workspace_summary import WorkspaceSummaryRead
from app.services.capability_map import load_capability_map

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


async def _gap_counts(
    db: AsyncSession, workspace_id: UUID, org_id: UUID
) -> tuple[int, int, int]:
    """Domains without capabilities, caps without systems, products without caps."""
    domains, capabilities = await load_capability_map(db, workspace_id, org_id)

    caps_by_domain: dict[str, list] = defaultdict(list)
    for cap in capabilities:
        domain_id = (cap.properties or {}).get("domain_id")
        if domain_id:
            caps_by_domain[str(domain_id)].append(cap)

    incomplete_domain_count = sum(1 for d in domains if not caps_by_domain.get(str(d.id)))

    capabilities_without_system_count = 0
    if capabilities:
        cap_ids = [c.id for c in capabilities]
        rel_result = await db.execute(
            select(Relationship.from_object_id).where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.type == "supported_by",
                Relationship.from_object_id.in_(cap_ids),
                Relationship.to_type.in_(SYSTEM_TYPES),
            )
        )
        supported = {str(row[0]) for row in rel_result.all()}
        capabilities_without_system_count = sum(1 for c in capabilities if str(c.id) not in supported)

    products_result = await db.execute(
        select(Product)
        .where(Product.workspace_id == workspace_id, Product.org_id == org_id)
        .options(selectinload(Product.capabilities))
    )
    products_without_capabilities_count = sum(
        1 for p in products_result.scalars().all() if not p.capabilities
    )

    return (
        incomplete_domain_count,
        capabilities_without_system_count,
        products_without_capabilities_count,
    )


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
        gap_counts,
    ) = await asyncio.gather(
        _count_objects(db, workspace_id, org_id, object_type="business_domain"),
        _count_objects(db, workspace_id, org_id, object_type="capability"),
        _count_objects(db, workspace_id, org_id, object_types=SYSTEM_TYPES),
        _count_objects(db, workspace_id, org_id, object_type="roadmap_item"),
        _count_table(db, Product, workspace_id, org_id),
        _count_table(db, Process, workspace_id, org_id),
        _count_table(db, CustomerJourney, workspace_id, org_id),
        _gap_counts(db, workspace_id, org_id),
    )

    incomplete_domain_count, capabilities_without_system_count, products_without_capabilities_count = (
        gap_counts
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
        incomplete_domain_count=incomplete_domain_count,
        capabilities_without_system_count=capabilities_without_system_count,
        products_without_capabilities_count=products_without_capabilities_count,
    )
