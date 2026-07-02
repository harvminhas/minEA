"""Data domain assignment (belongs_to) and read-only rollups."""
from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_layer import DataLink
from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.schemas.data_layer import DataLinkRead
from app.services.relationship_rules import DATA_ENTITY_LIFECYCLE_TYPES, DATA_STORE_ACCESS_TYPES

RollupItem = dict[str, str]

DEFAULT_DATA_DOMAIN_NAME = "Unassigned"


async def get_or_create_default_data_domain(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> MinEAObject:
    """Ensure every workspace has a fallback domain for mandatory entity assignment."""
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "data_domain",
            MinEAObject.name == DEFAULT_DATA_DOMAIN_NAME,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    domain = MinEAObject(
        workspace_id=workspace_id,
        org_id=org_id,
        type="data_domain",
        name=DEFAULT_DATA_DOMAIN_NAME,
        description="Default domain for entities without an explicit data domain assignment.",
        properties={"is_default": True},
        created_by=user_id,
    )
    db.add(domain)
    await db.flush()
    return domain


async def load_domain_rollup(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    domain_id: uuid.UUID,
) -> dict[str, list[RollupItem]]:
    entity_rows = await db.execute(
        select(MinEAObject.id, MinEAObject.name)
        .join(Relationship, Relationship.from_object_id == MinEAObject.id)
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_type == "data_object",
            Relationship.to_type == "data_domain",
            Relationship.to_object_id == domain_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
        .order_by(MinEAObject.name)
    )
    entities = [{"id": str(row[0]), "name": row[1]} for row in entity_rows.all()]

    store_rows = await db.execute(
        select(MinEAObject.id, MinEAObject.name)
        .join(Relationship, Relationship.from_object_id == MinEAObject.id)
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_type == "data_store",
            Relationship.to_type == "data_domain",
            Relationship.to_object_id == domain_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
        .order_by(MinEAObject.name)
    )
    stores = [{"id": str(row[0]), "name": row[1]} for row in store_rows.all()]

    entity_ids = [uuid.UUID(item["id"]) for item in entities]
    store_ids = [uuid.UUID(item["id"]) for item in stores]
    systems: dict[uuid.UUID, str] = {}

    if entity_ids:
        entity_system_rows = await db.execute(
            select(MinEAObject.id, MinEAObject.name)
            .join(Relationship, Relationship.from_object_id == MinEAObject.id)
            .where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.from_type == "application",
                Relationship.to_object_id.in_(entity_ids),
                Relationship.to_type == "data_object",
                Relationship.type.in_(tuple(DATA_ENTITY_LIFECYCLE_TYPES)),
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
            )
            .order_by(MinEAObject.name)
        )
        for system_id, name in entity_system_rows.all():
            systems[system_id] = name

    if store_ids:
        store_system_rows = await db.execute(
            select(MinEAObject.id, MinEAObject.name)
            .join(Relationship, Relationship.from_object_id == MinEAObject.id)
            .where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.from_type == "application",
                Relationship.to_object_id.in_(store_ids),
                Relationship.to_type == "data_store",
                Relationship.type.in_(tuple(DATA_STORE_ACCESS_TYPES)),
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
            )
            .order_by(MinEAObject.name)
        )
        for system_id, name in store_system_rows.all():
            systems[system_id] = name

    direct_system_rows = await db.execute(
        select(MinEAObject.id, MinEAObject.name)
        .join(Relationship, Relationship.from_object_id == MinEAObject.id)
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_type == "application",
            Relationship.to_type == "data_domain",
            Relationship.to_object_id == domain_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
        .order_by(MinEAObject.name)
    )
    for system_id, name in direct_system_rows.all():
        systems[system_id] = name

    return {
        "entities": entities,
        "stores": stores,
        "systems": [{"id": str(sid), "name": name} for sid, name in sorted(systems.items(), key=lambda x: x[1].lower())],
    }


async def load_assigned_domain_id(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    subject_id: uuid.UUID,
    subject_type: str,
) -> uuid.UUID | None:
    result = await db.execute(
        select(Relationship.to_object_id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_object_id == subject_id,
            Relationship.from_type == subject_type,
            Relationship.to_type == "data_domain",
        )
    )
    return result.scalar_one_or_none()


async def load_assigned_domain_ids(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    store_id: uuid.UUID,
) -> list[uuid.UUID]:
    result = await db.execute(
        select(Relationship.to_object_id)
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_object_id == store_id,
            Relationship.from_type == "data_store",
            Relationship.to_type == "data_domain",
        )
        .order_by(Relationship.created_at)
    )
    return list(result.scalars().all())


async def enrich_entity_domain_links(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
    links: list[DataLinkRead],
) -> list[DataLinkRead]:
    """Expose belongs_to domain assignment in data-layer link lists."""
    if any(l.link_kind == "governed_by" and l.entity_kind == "data_domain" for l in links):
        return links
    domain_id = await load_assigned_domain_id(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        subject_id=entity_id,
        subject_type="data_object",
    )
    if domain_id is None:
        return links
    rel_result = await db.execute(
        select(Relationship.id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_object_id == entity_id,
            Relationship.from_type == "data_object",
            Relationship.to_object_id == domain_id,
            Relationship.to_type == "data_domain",
        )
    )
    rel_id = rel_result.scalar_one_or_none()
    if rel_id is None:
        return links
    name_result = await db.execute(
        select(MinEAObject.name).where(
            MinEAObject.id == domain_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "data_domain",
        )
    )
    name = name_result.scalar_one_or_none()
    return [
        DataLinkRead(
            id=rel_id,
            entity_kind="data_domain",
            entity_id=domain_id,
            entity_name=name or "Unknown",
            link_kind="governed_by",
        ),
        *links,
    ]


async def sync_entity_domain_property(
    obj: MinEAObject,
    *,
    domain_id: uuid.UUID | None,
) -> None:
    props = dict(obj.properties or {})
    if domain_id is None:
        props.pop("data_domain_id", None)
    else:
        props["data_domain_id"] = str(domain_id)
    obj.properties = props


async def replace_entity_domain_assignment(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
    domain_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> None:
    await db.execute(
        delete(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_object_id == entity_id,
            Relationship.from_type == "data_object",
            Relationship.to_type == "data_domain",
        )
    )
    db.add(
        Relationship(
            workspace_id=workspace_id,
            org_id=org_id,
            type="belongs_to",
            from_object_id=entity_id,
            from_type="data_object",
            to_object_id=domain_id,
            to_type="data_domain",
            created_by=user_id,
        )
    )


async def replace_system_domain_assignment(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    system_id: uuid.UUID,
    domain_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> None:
    await db.execute(
        delete(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_object_id == system_id,
            Relationship.from_type == "application",
            Relationship.to_type == "data_domain",
        )
    )
    db.add(
        Relationship(
            workspace_id=workspace_id,
            org_id=org_id,
            type="belongs_to",
            from_object_id=system_id,
            from_type="application",
            to_object_id=domain_id,
            to_type="data_domain",
            created_by=user_id,
        )
    )


async def add_store_domain_assignment(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    store_id: uuid.UUID,
    domain_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> None:
    existing = await db.execute(
        select(Relationship.id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_object_id == store_id,
            Relationship.from_type == "data_store",
            Relationship.to_object_id == domain_id,
            Relationship.to_type == "data_domain",
        )
    )
    if existing.scalar_one_or_none() is not None:
        return
    db.add(
        Relationship(
            workspace_id=workspace_id,
            org_id=org_id,
            type="belongs_to",
            from_object_id=store_id,
            from_type="data_store",
            to_object_id=domain_id,
            to_type="data_domain",
            created_by=user_id,
        )
    )


async def load_entity_owner_system_id(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
) -> uuid.UUID | None:
    """Owning system for a data entity (owns relationship, with managed_by fallback)."""
    rel_result = await db.execute(
        select(Relationship.from_object_id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "owns",
            Relationship.from_type == "application",
            Relationship.to_object_id == entity_id,
            Relationship.to_type == "data_object",
        )
    )
    owner_id = rel_result.scalar_one_or_none()
    if owner_id is not None:
        return owner_id

    link_result = await db.execute(
        select(DataLink.entity_id).where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_entity",
            DataLink.subject_id == entity_id,
            DataLink.link_kind == "managed_by",
            DataLink.entity_kind == "application",
        )
    )
    return link_result.scalar_one_or_none()


async def clear_entity_owner_assignment(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
) -> None:
    await db.execute(
        delete(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "owns",
            Relationship.from_type == "application",
            Relationship.to_object_id == entity_id,
            Relationship.to_type == "data_object",
        )
    )
    await db.execute(
        delete(DataLink).where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_entity",
            DataLink.subject_id == entity_id,
            DataLink.link_kind == "managed_by",
            DataLink.entity_kind == "application",
        )
    )


async def replace_entity_owner_assignment(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
    system_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> None:
    await clear_entity_owner_assignment(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        entity_id=entity_id,
    )
    db.add(
        Relationship(
            workspace_id=workspace_id,
            org_id=org_id,
            type="owns",
            from_object_id=system_id,
            from_type="application",
            to_object_id=entity_id,
            to_type="data_object",
            created_by=user_id,
        )
    )


async def enrich_entity_owner_links(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
    links: list[DataLinkRead],
) -> list[DataLinkRead]:
    """Expose owns assignment in data-layer link lists."""
    if any(l.link_kind == "managed_by" and l.entity_kind == "application" for l in links):
        return links
    system_id = await load_entity_owner_system_id(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        entity_id=entity_id,
    )
    if system_id is None:
        return links
    rel_result = await db.execute(
        select(Relationship.id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "owns",
            Relationship.from_type == "application",
            Relationship.from_object_id == system_id,
            Relationship.to_object_id == entity_id,
            Relationship.to_type == "data_object",
        )
    )
    rel_id = rel_result.scalar_one_or_none()
    if rel_id is None:
        return links
    name_result = await db.execute(
        select(MinEAObject.name).where(
            MinEAObject.id == system_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "application",
        )
    )
    name = name_result.scalar_one_or_none()
    return [
        DataLinkRead(
            id=rel_id,
            entity_kind="application",
            entity_id=system_id,
            entity_name=name or "Unknown",
            link_kind="managed_by",
        ),
        *links,
    ]
