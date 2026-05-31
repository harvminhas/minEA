"""Product graph scope — systems and components reachable from capabilities."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.relationships import Relationship
from app.models.views_graph import ProductCapability, ProductSystemOverride, Realization, RealizationSystem

SYSTEM_TYPES = ("application", "solution", "technical_capability")


@dataclass(frozen=True)
class ProductScope:
    system_ids: frozenset[uuid.UUID]
    component_ids: frozenset[uuid.UUID]

    @property
    def provider_ids(self) -> frozenset[uuid.UUID]:
        """Entities that can expose APIs or publish events (systems + components)."""
        return self.system_ids | self.component_ids

    @property
    def consumer_ids(self) -> frozenset[uuid.UUID]:
        """Entities that can consume APIs or subscribe to events."""
        return self.system_ids | self.component_ids


async def capability_ids_for_product(db: AsyncSession, product_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(ProductCapability.capability_id).where(ProductCapability.product_id == product_id)
    )
    return [row[0] for row in result.all()]


async def system_ids_for_product(
    db: AsyncSession,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> set[uuid.UUID]:
    cap_ids = await capability_ids_for_product(db, product_id)
    system_ids: set[uuid.UUID] = set()

    if cap_ids:
        via_realization = await db.execute(
            select(distinct(RealizationSystem.system_id))
            .select_from(ProductCapability)
            .join(Realization, Realization.capability_id == ProductCapability.capability_id)
            .join(RealizationSystem, RealizationSystem.realization_id == Realization.id)
            .where(ProductCapability.product_id == product_id)
        )
        system_ids |= {row[0] for row in via_realization.all()}

        via_supported = await db.execute(
            select(distinct(Relationship.to_object_id)).where(
                Relationship.type == "supported_by",
                Relationship.from_type == "capability",
                Relationship.from_object_id.in_(cap_ids),
                Relationship.to_type.in_(SYSTEM_TYPES),
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
            )
        )
        system_ids |= {row[0] for row in via_supported.all()}

    override_result = await db.execute(
        select(ProductSystemOverride.system_id).where(ProductSystemOverride.product_id == product_id)
    )
    system_ids |= {row[0] for row in override_result.all()}
    return system_ids


async def component_ids_for_systems(
    db: AsyncSession,
    system_ids: set[uuid.UUID],
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> set[uuid.UUID]:
    if not system_ids:
        return set()

    result = await db.execute(
        select(distinct(Relationship.from_object_id)).where(
            Relationship.type == "part_of",
            Relationship.from_type == "component",
            Relationship.to_type == "application",
            Relationship.to_object_id.in_(system_ids),
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )
    return {row[0] for row in result.all()}


async def resolve_product_scope(
    db: AsyncSession,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> ProductScope:
    system_ids = await system_ids_for_product(db, product_id, workspace_id, org_id)
    component_ids = await component_ids_for_systems(db, system_ids, workspace_id, org_id)
    return ProductScope(
        system_ids=frozenset(system_ids),
        component_ids=frozenset(component_ids),
    )
