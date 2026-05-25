"""Derive systems involved in journey steps from linked processes."""
from __future__ import annotations

import uuid

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Process, Realization, RealizationSystem, Stage, StageCapability


async def derive_system_ids_for_processes(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    process_ids: list[uuid.UUID],
) -> set[uuid.UUID]:
    if not process_ids:
        return set()

    cap_result = await db.execute(
        select(distinct(StageCapability.capability_id))
        .select_from(StageCapability)
        .join(Stage, Stage.id == StageCapability.stage_id)
        .join(Process, Process.id == Stage.process_id)
        .where(
            Process.id.in_(process_ids),
            Process.workspace_id == workspace_id,
            Process.org_id == org_id,
        )
    )
    cap_ids = [row[0] for row in cap_result.all()]
    if not cap_ids:
        return set()

    via_realization = await db.execute(
        select(distinct(RealizationSystem.system_id))
        .join(Realization, Realization.id == RealizationSystem.realization_id)
        .where(
            Realization.capability_id.in_(cap_ids),
            Realization.workspace_id == workspace_id,
            Realization.org_id == org_id,
        )
    )
    system_ids = {row[0] for row in via_realization.all()}

    via_rel = await db.execute(
        select(distinct(Relationship.from_object_id)).where(
            Relationship.type.in_(("supports", "supported_by")),
            Relationship.to_object_id.in_(cap_ids),
            Relationship.from_type == "application",
        )
    )
    system_ids |= {row[0] for row in via_rel.all()}
    return system_ids


async def derive_systems_for_processes(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    process_ids: list[uuid.UUID],
) -> list[dict]:
    system_ids = await derive_system_ids_for_processes(db, workspace_id, org_id, process_ids)
    if not system_ids:
        return []

    result = await db.execute(
        select(MinEAObject.id, MinEAObject.name).where(
            MinEAObject.id.in_(system_ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    return [{"id": row[0], "name": row[1]} for row in result.all()]
