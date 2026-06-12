"""Product links for repository systems (derived scope + explicit overrides)."""
from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.views_graph import Product, ProductSystemOverride
from app.services.product_scope import SYSTEM_TYPES, resolve_product_scope

SYSTEM_PRODUCT_HOST_TYPES = SYSTEM_TYPES


async def products_for_system(
    db: AsyncSession,
    system_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[dict[str, str]]:
    override_result = await db.execute(
        select(ProductSystemOverride.product_id).where(ProductSystemOverride.system_id == system_id)
    )
    override_product_ids = {row[0] for row in override_result.all()}

    products_result = await db.execute(
        select(Product.id, Product.name)
        .where(Product.workspace_id == workspace_id, Product.org_id == org_id)
        .order_by(Product.name)
    )

    links: list[dict[str, str]] = []
    for product_id, product_name in products_result.all():
        scope = await resolve_product_scope(db, product_id, workspace_id, org_id)
        if system_id not in scope.system_ids:
            continue
        links.append(
            {
                "id": str(product_id),
                "name": product_name,
                "link_type": "override" if product_id in override_product_ids else "derived",
            }
        )
    return links


async def link_system_to_product(
    db: AsyncSession,
    system_id: uuid.UUID,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> None:
    system_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == system_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    system = system_result.scalar_one_or_none()
    if system is None or system.type not in SYSTEM_PRODUCT_HOST_TYPES:
        raise ValueError("Only systems can be linked to products.")

    product_result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.workspace_id == workspace_id,
            Product.org_id == org_id,
        )
    )
    if product_result.scalar_one_or_none() is None:
        raise ValueError("Product not found.")

    existing = await db.execute(
        select(ProductSystemOverride).where(
            ProductSystemOverride.product_id == product_id,
            ProductSystemOverride.system_id == system_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(ProductSystemOverride(product_id=product_id, system_id=system_id))


async def unlink_system_from_product(
    db: AsyncSession,
    system_id: uuid.UUID,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> bool:
    product_result = await db.execute(
        select(Product.id).where(
            Product.id == product_id,
            Product.workspace_id == workspace_id,
            Product.org_id == org_id,
        )
    )
    if product_result.scalar_one_or_none() is None:
        raise ValueError("Product not found.")

    result = await db.execute(
        delete(ProductSystemOverride).where(
            ProductSystemOverride.product_id == product_id,
            ProductSystemOverride.system_id == system_id,
        )
    )
    return bool(result.rowcount)
