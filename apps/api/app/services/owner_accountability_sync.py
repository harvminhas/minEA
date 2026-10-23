"""Keep People → Team accountabilities in sync with object owner_team_id."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.people import PeopleAccountability
from app.models.views_graph import Process, Product
from app.services.relationship_labels import ACCOUNTABILITY_OWNER_LEGACY

# Accountability row written when an entity's owner team is set in forms: the team "Owns" it and the
# entity reads "Owned by" that team. Syncs before October 2026 wrote "manages" for applications and
# "stewards" for data stores; those rows stay as they are (shared dev/prod database, no rewrite) and
# are treated as the owner row when their team is the entity's owner team (OWNER_LEGACY_LINK_KINDS).
_OBJECT_OWNER_ACCOUNTABILITY: dict[str, tuple[str, str]] = {
    "application": ("application", "owns"),
    "solution": ("application", "owns"),
    "capability": ("capability", "owns"),
    "business_domain": ("business_domain", "owns"),
    "data_domain": ("data_domain", "owns"),
    "data_store": ("data_store", "owns"),
}

# entity_kind -> verb older owner syncs wrote (mirrors accountability_owner_legacy in relationship_labels.json).
OWNER_LEGACY_LINK_KINDS: dict[str, str] = dict(ACCOUNTABILITY_OWNER_LEGACY)


# entity_kinds whose owner rows mirror a records-table object; Owners & Teams (GET /ownership) lists those.
OBJECT_OWNER_ENTITY_KINDS: frozenset[str] = frozenset(k for k, _ in _OBJECT_OWNER_ACCOUNTABILITY.values())


def is_object_owner_row(entity_kind: str, link_kind: str) -> bool:
    """True for an owns / legacy-owner row on a record that the ownership roles already cover."""
    return entity_kind in OBJECT_OWNER_ENTITY_KINDS and link_kind in owner_link_kinds(entity_kind)


def owner_link_kinds(entity_kind: str) -> tuple[str, ...]:
    """Verbs that mean "this team owns it" for one entity kind: owns, plus any legacy sync verb."""
    legacy = OWNER_LEGACY_LINK_KINDS.get(entity_kind)
    return ("owns", legacy) if legacy else ("owns",)


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
                PeopleAccountability.link_kind.in_(owner_link_kinds(entity_kind)),
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
            PeopleAccountability.link_kind.in_(owner_link_kinds(entity_kind)),
        )
    )
    # A legacy "manages" / "stewards" owner row already says it; don't add a second row.
    if existing.scalars().first():
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
