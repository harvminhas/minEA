"""Computed product portfolio stats from the repository graph."""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.views_graph import Product, ProductCapability, Realization
from app.services.product_integration import integration_counts_for_product
from app.services.product_scope import capability_ids_for_product, resolve_product_scope

MATURITY_RANK = {
    "manual": 0,
    "outsourced": 1,
    "partial": 2,
    "automated": 3,
}

MATURITY_LABEL = {v: k for k, v in MATURITY_RANK.items()}


async def count_capabilities(db: AsyncSession, product_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(ProductCapability).where(ProductCapability.product_id == product_id)
    )
    return result.scalar_one()


async def count_systems_for_product(
    db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> int:
    scope = await resolve_product_scope(db, product_id, workspace_id, org_id)
    return len(scope.system_ids)


async def worst_maturity_for_product(db: AsyncSession, product_id: uuid.UUID) -> str | None:
    result = await db.execute(
        select(Realization.maturity)
        .select_from(ProductCapability)
        .join(Realization, Realization.capability_id == ProductCapability.capability_id)
        .where(ProductCapability.product_id == product_id)
    )
    maturities = [row[0] for row in result.all()]
    if not maturities:
        return None
    worst = min(maturities, key=lambda m: MATURITY_RANK.get(m, 99))
    return worst


async def enrich_product(db: AsyncSession, product: Product) -> dict:
    ws_id = product.workspace_id
    org_id = product.org_id
    pid = product.id
    scope = await resolve_product_scope(db, pid, ws_id, org_id)
    integration = await integration_counts_for_product(db, pid, ws_id, org_id, scope=scope)
    return {
        "capability_count": await count_capabilities(db, pid),
        "system_count": len(scope.system_ids),
        "maturity_indicator": await worst_maturity_for_product(db, pid),
        **integration,
    }


async def validate_capability_ids(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, capability_ids: list[uuid.UUID]
) -> None:
    if not capability_ids:
        return
    from app.models.objects import MinEAObject

    result = await db.execute(
        select(MinEAObject.id).where(
            MinEAObject.id.in_(capability_ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "capability",
        )
    )
    found = {row[0] for row in result.all()}
    missing = set(capability_ids) - found
    if missing:
        raise ValueError(f"Invalid capability ids: {missing}")


# Re-export for routers that import _capability_ids
_capability_ids = capability_ids_for_product
