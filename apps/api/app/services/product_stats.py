"""Computed product portfolio stats from the repository graph."""
from __future__ import annotations

import uuid

from sqlalchemy import distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product, ProductCapability, Realization, RealizationSystem

MATURITY_RANK = {
    "manual": 0,
    "outsourced": 1,
    "partial": 2,
    "automated": 3,
}

MATURITY_LABEL = {v: k for k, v in MATURITY_RANK.items()}


async def _capability_ids(db: AsyncSession, product_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(ProductCapability.capability_id).where(ProductCapability.product_id == product_id)
    )
    return [row[0] for row in result.all()]


async def count_capabilities(db: AsyncSession, product_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(ProductCapability).where(ProductCapability.product_id == product_id)
    )
    return result.scalar_one()


async def count_systems_for_product(db: AsyncSession, product_id: uuid.UUID) -> int:
    cap_ids = await _capability_ids(db, product_id)
    if not cap_ids:
        return 0

    # Via realizations → systems
    via_realization = await db.execute(
        select(distinct(RealizationSystem.system_id))
        .select_from(ProductCapability)
        .join(Realization, Realization.capability_id == ProductCapability.capability_id)
        .join(RealizationSystem, RealizationSystem.realization_id == Realization.id)
        .where(ProductCapability.product_id == product_id)
    )
    system_ids = {row[0] for row in via_realization.all()}

    # Fallback: relationship supports (system → capability)
    via_rel = await db.execute(
        select(distinct(Relationship.from_object_id)).where(
            Relationship.type.in_(("supports", "supported_by")),
            Relationship.to_object_id.in_(cap_ids),
            Relationship.from_type == "application",
        )
    )
    system_ids |= {row[0] for row in via_rel.all()}

    return len(system_ids)


async def count_apis_for_product(db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID) -> int:
    cap_ids = await _capability_ids(db, product_id)
    if not cap_ids:
        return 0

    # APIs exposed by systems linked to capabilities
    q = text(
        """
        WITH product_systems AS (
            SELECT DISTINCT rs.system_id AS system_id
            FROM product_capabilities pc
            JOIN realizations r ON r.capability_id = pc.capability_id
            JOIN realization_systems rs ON rs.realization_id = r.id
            WHERE pc.product_id = :product_id
            UNION
            SELECT DISTINCT rel.from_object_id AS system_id
            FROM product_capabilities pc
            JOIN relationships rel ON rel.to_object_id = pc.capability_id
                AND rel.type IN ('supports', 'supported_by')
                AND rel.from_type = 'application'
            WHERE pc.product_id = :product_id
        )
        SELECT COUNT(DISTINCT rel.to_object_id)
        FROM product_systems ps
        JOIN relationships rel ON rel.from_object_id = ps.system_id
            AND rel.type = 'exposes'
            AND rel.to_type = 'api'
        WHERE rel.workspace_id = :workspace_id
        """
    )
    result = await db.execute(
        q, {"product_id": str(product_id), "workspace_id": str(workspace_id)}
    )
    return result.scalar_one() or 0


async def count_data_stores_for_product(
    db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID
) -> int:
    cap_ids = await _capability_ids(db, product_id)
    if not cap_ids:
        return 0

    q = text(
        """
        WITH cap_data AS (
            SELECT DISTINCT rel.to_object_id AS data_object_id
            FROM product_capabilities pc
            JOIN relationships rel ON rel.from_object_id = pc.capability_id
                AND rel.type IN ('owns', 'accesses', 'uses')
                AND rel.to_type = 'data_object'
            WHERE pc.product_id = :product_id
        )
        SELECT COUNT(DISTINCT rel.to_object_id)
        FROM cap_data cd
        JOIN relationships rel ON rel.from_object_id = cd.data_object_id
            AND rel.type = 'stores_in'
            AND rel.to_type = 'data_store'
        WHERE rel.workspace_id = :workspace_id
        """
    )
    result = await db.execute(
        q, {"product_id": str(product_id), "workspace_id": str(workspace_id)}
    )
    return result.scalar_one() or 0


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
    pid = product.id
    return {
        "capability_count": await count_capabilities(db, pid),
        "system_count": await count_systems_for_product(db, pid),
        "api_count": await count_apis_for_product(db, pid, ws_id),
        "data_store_count": await count_data_stores_for_product(db, pid, ws_id),
        "maturity_indicator": await worst_maturity_for_product(db, pid),
    }


async def validate_capability_ids(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, capability_ids: list[uuid.UUID]
) -> None:
    if not capability_ids:
        return
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
