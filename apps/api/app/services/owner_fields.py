"""Owner team + point of contact fields shared across repository and view entities."""
from __future__ import annotations

import uuid
from typing import Any, Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import PeopleContact, Team
from app.services.owner_accountability_sync import sync_owner_team_accountability


class Ownable(Protocol):
    owner: str | None
    owner_team_id: uuid.UUID | None
    point_of_contact_id: uuid.UUID | None
    point_of_contact_name: str | None


def ownership_read_payload(entity: Ownable) -> dict[str, Any]:
    team_id = getattr(entity, "owner_team_id", None)
    contact_id = getattr(entity, "point_of_contact_id", None)
    return {
        "owner": entity.owner,
        "owner_team_id": str(team_id) if team_id else None,
        "owner_team_name": entity.owner,
        "point_of_contact_id": str(contact_id) if contact_id else None,
        "point_of_contact_name": entity.point_of_contact_name,
    }


def apply_ownership_write(
    entity: Ownable,
    *,
    owner: str | None = None,
    owner_team_id: str | uuid.UUID | None = None,
    owner_team_name: str | None = None,
    point_of_contact_id: str | uuid.UUID | None = None,
    point_of_contact_name: str | None = None,
) -> None:
    team_uuid: uuid.UUID | None = None
    if owner_team_id:
        team_uuid = owner_team_id if isinstance(owner_team_id, uuid.UUID) else uuid.UUID(str(owner_team_id))

    contact_uuid: uuid.UUID | None = None
    if point_of_contact_id:
        contact_uuid = (
            point_of_contact_id
            if isinstance(point_of_contact_id, uuid.UUID)
            else uuid.UUID(str(point_of_contact_id))
        )

    resolved_team_name = (owner_team_name or owner or "").strip() or None
    entity.owner_team_id = team_uuid
    entity.owner = resolved_team_name
    entity.point_of_contact_id = contact_uuid
    entity.point_of_contact_name = (point_of_contact_name or "").strip() or None


def ownership_from_body(body: Any) -> dict[str, Any]:
    return {
        "owner": getattr(body, "owner", None),
        "owner_team_id": getattr(body, "owner_team_id", None),
        "owner_team_name": getattr(body, "owner_team_name", None),
        "point_of_contact_id": getattr(body, "point_of_contact_id", None),
        "point_of_contact_name": getattr(body, "point_of_contact_name", None),
    }


async def resolve_owner_team(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    owner_team_id: str | uuid.UUID | None = None,
    owner_team_name: str | None = None,
    owner: str | None = None,
) -> tuple[uuid.UUID | None, str | None]:
    """Match an existing team by id or name, or create one when only a name is provided."""
    if owner_team_id:
        team_uuid = owner_team_id if isinstance(owner_team_id, uuid.UUID) else uuid.UUID(str(owner_team_id))
        resolved_name = (owner_team_name or owner or "").strip() or None
        return team_uuid, resolved_name

    team_name = (owner_team_name or owner or "").strip()
    if not team_name:
        return None, None

    result = await db.execute(
        select(Team).where(
            Team.workspace_id == workspace_id,
            Team.org_id == org_id,
            func.lower(Team.name) == team_name.lower(),
        )
    )
    team = result.scalar_one_or_none()
    if not team:
        team = Team(
            workspace_id=workspace_id,
            org_id=org_id,
            name=team_name,
            created_by=user_id,
        )
        db.add(team)
        await db.flush()

    return team.id, team.name


async def resolve_point_of_contact(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    owner_team_id: uuid.UUID | None,
    point_of_contact_id: str | uuid.UUID | None = None,
    point_of_contact_name: str | None = None,
) -> tuple[uuid.UUID | None, str | None]:
    """Match an existing contact by id or name, or create one when only a name is provided."""
    if point_of_contact_id:
        contact_uuid = (
            point_of_contact_id
            if isinstance(point_of_contact_id, uuid.UUID)
            else uuid.UUID(str(point_of_contact_id))
        )
        result = await db.execute(
            select(PeopleContact).where(
                PeopleContact.id == contact_uuid,
                PeopleContact.workspace_id == workspace_id,
                PeopleContact.org_id == org_id,
            )
        )
        contact = result.scalar_one_or_none()
        if contact:
            return contact.id, contact.name
        return contact_uuid, (point_of_contact_name or "").strip() or None

    contact_name = (point_of_contact_name or "").strip()
    if not contact_name:
        return None, None

    result = await db.execute(
        select(PeopleContact).where(
            PeopleContact.workspace_id == workspace_id,
            PeopleContact.org_id == org_id,
            func.lower(PeopleContact.name) == contact_name.lower(),
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        contact = PeopleContact(
            workspace_id=workspace_id,
            org_id=org_id,
            name=contact_name,
            team_id=owner_team_id,
            created_by=user_id,
        )
        db.add(contact)
        await db.flush()
    elif owner_team_id and contact.team_id is None:
        contact.team_id = owner_team_id

    return contact.id, contact.name


async def apply_ownership_write_resolved(
    db: AsyncSession,
    entity: Ownable,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    owner: str | None = None,
    owner_team_id: str | uuid.UUID | None = None,
    owner_team_name: str | None = None,
    point_of_contact_id: str | uuid.UUID | None = None,
    point_of_contact_name: str | None = None,
) -> None:
    previous_team_id = getattr(entity, "owner_team_id", None)
    team_uuid, resolved_team_name = await resolve_owner_team(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        owner_team_id=owner_team_id,
        owner_team_name=owner_team_name,
        owner=owner,
    )
    contact_uuid, resolved_contact_name = await resolve_point_of_contact(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        owner_team_id=team_uuid,
        point_of_contact_id=point_of_contact_id,
        point_of_contact_name=point_of_contact_name,
    )
    apply_ownership_write(
        entity,
        owner_team_id=team_uuid,
        owner_team_name=resolved_team_name,
        point_of_contact_id=contact_uuid,
        point_of_contact_name=resolved_contact_name,
    )
    await sync_owner_team_accountability(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        entity=entity,
        previous_team_id=previous_team_id,
        team_id=team_uuid,
    )
