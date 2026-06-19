"""Entities where a people contact is the point of contact."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.views_graph import CustomerJourney, Process, Product
from app.schemas.people import ContactAssignmentRead

_OBJECT_ENTITY_KIND: dict[str, str] = {
    "application": "application",
    "solution": "application",
    "capability": "capability",
    "business_domain": "business_domain",
    "data_domain": "data_domain",
    "data_store": "data_store",
}


def _object_entity_kind(object_type: str) -> str | None:
    return _OBJECT_ENTITY_KIND.get(object_type)


async def load_contact_assignments(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    contact_id: UUID,
) -> list[ContactAssignmentRead]:
    items: list[ContactAssignmentRead] = []

    object_result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.point_of_contact_id == contact_id,
        )
        .order_by(MinEAObject.type, MinEAObject.name)
    )
    for obj in object_result.scalars():
        entity_kind = _object_entity_kind(obj.type)
        if not entity_kind:
            continue
        items.append(
            ContactAssignmentRead(
                entity_kind=entity_kind,
                entity_id=obj.id,
                entity_name=obj.name,
                subtitle=obj.owner,
            )
        )

    product_result = await db.execute(
        select(Product)
        .where(
            Product.workspace_id == workspace_id,
            Product.org_id == org_id,
            Product.point_of_contact_id == contact_id,
        )
        .order_by(Product.name)
    )
    for product in product_result.scalars():
        items.append(
            ContactAssignmentRead(
                entity_kind="product",
                entity_id=product.id,
                entity_name=product.name,
                subtitle=product.product_line,
            )
        )

    process_result = await db.execute(
        select(Process)
        .where(
            Process.workspace_id == workspace_id,
            Process.org_id == org_id,
            Process.point_of_contact_id == contact_id,
        )
        .order_by(Process.name)
    )
    for process in process_result.scalars():
        items.append(
            ContactAssignmentRead(
                entity_kind="process",
                entity_id=process.id,
                entity_name=process.name,
                subtitle=process.owner,
            )
        )

    journey_result = await db.execute(
        select(CustomerJourney)
        .where(
            CustomerJourney.workspace_id == workspace_id,
            CustomerJourney.org_id == org_id,
            CustomerJourney.point_of_contact_id == contact_id,
        )
        .order_by(CustomerJourney.name)
    )
    for journey in journey_result.scalars():
        items.append(
            ContactAssignmentRead(
                entity_kind="journey",
                entity_id=journey.id,
                entity_name=journey.name,
                subtitle=journey.owner,
            )
        )

    return items
