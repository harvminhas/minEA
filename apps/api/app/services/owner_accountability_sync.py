"""Keep People → Team accountabilities in sync with object owner_team_id."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.people import PeopleAccountability
from app.models.views_graph import Process, Product

# Default accountability verb when an entity's owner team is set in forms.
_OBJECT_OWNER_ACCOUNTABILITY: dict[str, tuple[str, str]] = {
    "application": ("application", "manages"),
    "solution": ("application", "manages"),
    "capability": ("capability", "owns"),
    "business_domain": ("business_domain", "owns"),
    "data_domain": ("data_domain", "owns"),
    "data_store": ("data_store", "stewards"),
}


def owner_accountability_target(entity: Any) -> tuple[str, uuid.UUID, str] | None:
    """Return (entity_kind, entity_id, link_kind) for People accountabilities, if applicable."""
    if isinstance(entity, MinEAObject):
        mapping = _OBJECT_OWNER_ACCOUNTABILITY.get(entity.type)
        if mapping:
            entity_kind, link_kind = mapping
            return entity_kind, entity.id, link_kind
        return None
    if isinstance(entity, Product):
        return "product", entity.id, "owns"
    if isinstance(entity, Process):
        return "process", entity.id, "owns"
    return None


async def sync_owner_team_accountability(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    entity: Any,
    previous_team_id: uuid.UUID | None,
    team_id: uuid.UUID | None,
) -> None:
    target = owner_accountability_target(entity)
    if not target:
        return

    entity_kind, entity_id, link_kind = target
    if entity_id is None:
        return

    if previous_team_id and previous_team_id != team_id:
        await db.execute(
            delete(PeopleAccountability).where(
                PeopleAccountability.workspace_id == workspace_id,
                PeopleAccountability.org_id == org_id,
                PeopleAccountability.subject_type == "team",
                PeopleAccountability.subject_id == previous_team_id,
                PeopleAccountability.entity_kind == entity_kind,
                PeopleAccountability.entity_id == entity_id,
                PeopleAccountability.link_kind == link_kind,
            )
        )

    if not team_id:
        return

    existing = await db.execute(
        select(PeopleAccountability.id).where(
            PeopleAccountability.workspace_id == workspace_id,
            PeopleAccountability.org_id == org_id,
            PeopleAccountability.subject_type == "team",
            PeopleAccountability.subject_id == team_id,
            PeopleAccountability.entity_kind == entity_kind,
            PeopleAccountability.entity_id == entity_id,
            PeopleAccountability.link_kind == link_kind,
        )
    )
    if existing.scalar_one_or_none():
        return

    db.add(
        PeopleAccountability(
            workspace_id=workspace_id,
            org_id=org_id,
            subject_type="team",
            subject_id=team_id,
            entity_kind=entity_kind,
            entity_id=entity_id,
            link_kind=link_kind,
        )
    )
