"""Business rules for repository relationships."""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.relationships import Relationship

DATA_STORE_ACCESS_TYPES = frozenset({"reads", "writes", "owns"})
DATA_ENTITY_LIFECYCLE_TYPES = frozenset({"creates", "updates", "reads", "owns"})


async def _assert_single_system_owner(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    target_id: uuid.UUID,
    target_type: str,
    owner_system_id: uuid.UUID,
    target_label: str,
) -> None:
    """Only one application may own a given data store or data entity."""
    result = await db.execute(
        select(Relationship.from_object_id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "owns",
            Relationship.from_type == "application",
            Relationship.to_object_id == target_id,
            Relationship.to_type == target_type,
        )
    )
    existing_owner_id = result.scalar_one_or_none()
    if existing_owner_id is None:
        return
    if existing_owner_id == owner_system_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This system already owns this {target_label}.",
        )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"This {target_label} already has an owning system.",
    )


async def assert_entity_domain_belongs_to_allowed(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
    domain_id: uuid.UUID,
) -> None:
    """Each data entity belongs to exactly one data domain."""
    result = await db.execute(
        select(Relationship.to_object_id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_type == "data_object",
            Relationship.from_object_id == entity_id,
            Relationship.to_type == "data_domain",
        )
    )
    existing_domain_id = result.scalar_one_or_none()
    if existing_domain_id is None:
        return
    if existing_domain_id == domain_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This entity already belongs to this data domain.",
        )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="This entity already belongs to a data domain. Remove the existing assignment first.",
    )


async def assert_system_domain_belongs_to_allowed(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    system_id: uuid.UUID,
    domain_id: uuid.UUID,
) -> None:
    """Each system belongs to exactly one data domain."""
    result = await db.execute(
        select(Relationship.to_object_id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "belongs_to",
            Relationship.from_type == "application",
            Relationship.from_object_id == system_id,
            Relationship.to_type == "data_domain",
        )
    )
    existing_domain_id = result.scalar_one_or_none()
    if existing_domain_id is None:
        return
    if existing_domain_id == domain_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This system already belongs to this data domain.",
        )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="This system already belongs to a data domain. Remove the existing assignment first.",
    )


async def assert_data_store_ownership_allowed(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    store_id: uuid.UUID,
    owner_system_id: uuid.UUID,
) -> None:
    await _assert_single_system_owner(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        target_id=store_id,
        target_type="data_store",
        owner_system_id=owner_system_id,
        target_label="data store",
    )


async def assert_data_entity_ownership_allowed(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity_id: uuid.UUID,
    owner_system_id: uuid.UUID,
) -> None:
    await _assert_single_system_owner(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        target_id=entity_id,
        target_type="data_object",
        owner_system_id=owner_system_id,
        target_label="data entity",
    )
