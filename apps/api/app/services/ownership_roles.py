"""Per-role owners on catalog records: Business owner, Technical owner, Support team.

Each role holds at most one team and one contact, stored as people_accountabilities rows
(subject_type 'team' | 'contact', entity_kind 'object', link_kind = the role). The record's own
owner_team_id / point_of_contact_id stay as the primary owner: the Business owner, or the first role
that is set. A record with no role rows but a primary owner reads that owner as its Business owner,
so records saved before roles existed keep showing (and moving) their owner.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Iterable

from sqlalchemy import and_, delete, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import ChangeLog, MinEAObject
from app.models.people import PeopleAccountability, PeopleContact, Team
from app.services.owner_fields import apply_ownership_write_resolved

ROLE_KINDS: tuple[str, ...] = ("business_owner", "technical_owner", "support_team")
ROLE_LABELS: dict[str, str] = {
    "business_owner": "Business owner",
    "technical_owner": "Technical owner",
    "support_team": "Support team",
}
OBJECT_ENTITY_KIND = "object"
SUBJECT_TYPES = ("team", "contact")


@dataclass
class RoleHolder:
    team_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None

    def empty(self) -> bool:
        return not self.team_id and not self.contact_id


@dataclass
class ObjectRoles:
    roles: dict[str, RoleHolder] = field(default_factory=dict)
    # True when no role rows exist and the Business owner is read from the record's primary owner.
    implicit: bool = False

    def holder(self, role: str) -> RoleHolder:
        return self.roles.setdefault(role, RoleHolder())

    def snapshot(self) -> dict[str, dict[str, str | None]]:
        return {
            role: {"team_id": str(h.team_id) if h.team_id else None, "contact_id": str(h.contact_id) if h.contact_id else None}
            for role, h in self.roles.items()
            if not h.empty()
        }


def primary_role(roles: dict[str, RoleHolder]) -> str | None:
    """The role the record's primary owner follows: Business owner, else the first role set."""
    for role in ROLE_KINDS:
        holder = roles.get(role)
        if holder and not holder.empty():
            return role
    return None


def roles_from_rows(obj: MinEAObject, rows: Iterable[PeopleAccountability]) -> ObjectRoles:
    out = ObjectRoles()
    for row in rows:
        if row.link_kind not in ROLE_KINDS:
            continue
        holder = out.holder(row.link_kind)
        if row.subject_type == "team":
            holder.team_id = row.subject_id
        elif row.subject_type == "contact":
            holder.contact_id = row.subject_id
    if not any(not h.empty() for h in out.roles.values()) and (obj.owner_team_id or obj.point_of_contact_id):
        out.roles = {"business_owner": RoleHolder(obj.owner_team_id, obj.point_of_contact_id)}
        out.implicit = True
    return out


def is_owned(obj: MinEAObject, roles: ObjectRoles) -> bool:
    """Owned = any role set, a primary team or contact, or legacy free-text owner."""
    if any(not h.empty() for h in roles.roles.values()):
        return True
    return bool(obj.owner_team_id or obj.point_of_contact_id or (obj.owner or "").strip())


async def load_role_rows(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, object_ids: list[uuid.UUID] | None = None
) -> dict[uuid.UUID, list[PeopleAccountability]]:
    query = select(PeopleAccountability).where(
        PeopleAccountability.workspace_id == workspace_id,
        PeopleAccountability.org_id == org_id,
        PeopleAccountability.entity_kind == OBJECT_ENTITY_KIND,
        PeopleAccountability.link_kind.in_(ROLE_KINDS),
    )
    if object_ids is not None:
        query = query.where(PeopleAccountability.entity_id.in_(object_ids))
    # Skip rows whose team or person is gone (subject_id has no FK); they would count a record as owned.
    query = query.where(
        or_(
            and_(PeopleAccountability.subject_type == "team", exists().where(Team.id == PeopleAccountability.subject_id)),
            and_(PeopleAccountability.subject_type == "contact", exists().where(PeopleContact.id == PeopleAccountability.subject_id)),
        )
    )
    by_object: dict[uuid.UUID, list[PeopleAccountability]] = {}
    for row in (await db.execute(query.order_by(PeopleAccountability.created_at))).scalars():
        by_object.setdefault(row.entity_id, []).append(row)
    return by_object


class OwnershipError(ValueError):
    pass


async def check_subject(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, subject_type: str, subject_id: uuid.UUID
) -> Team | PeopleContact:
    model = Team if subject_type == "team" else PeopleContact if subject_type == "contact" else None
    if model is None:
        raise OwnershipError("Owner must be a team or a contact")
    found = await db.scalar(
        select(model).where(model.id == subject_id, model.workspace_id == workspace_id, model.org_id == org_id)
    )
    if not found:
        raise OwnershipError(f"{subject_type.capitalize()} not found")
    return found


async def write_roles(
    db: AsyncSession,
    obj: MinEAObject,
    before: ObjectRoles,
    after: dict[str, RoleHolder],
    *,
    user_id: uuid.UUID | None,
    names: dict[uuid.UUID, str],
) -> bool:
    """Replace the record's role rows with `after`, re-sync the primary owner, log the change.
    Returns False when nothing changed."""
    after = {role: h for role, h in after.items() if role in ROLE_KINDS and not h.empty()}
    new = ObjectRoles(roles={r: RoleHolder(h.team_id, h.contact_id) for r, h in after.items()})
    if new.snapshot() == before.snapshot() and not before.implicit:
        return False
    if new.snapshot() == before.snapshot() and before.implicit:
        # Same owner as the record already shows; nothing to store.
        return False

    await db.execute(
        delete(PeopleAccountability).where(
            PeopleAccountability.workspace_id == obj.workspace_id,
            PeopleAccountability.org_id == obj.org_id,
            PeopleAccountability.entity_kind == OBJECT_ENTITY_KIND,
            PeopleAccountability.entity_id == obj.id,
            PeopleAccountability.link_kind.in_(ROLE_KINDS),
        )
    )
    for role, holder in after.items():
        for subject_type, subject_id in (("team", holder.team_id), ("contact", holder.contact_id)):
            if subject_id:
                db.add(
                    PeopleAccountability(
                        workspace_id=obj.workspace_id,
                        org_id=obj.org_id,
                        subject_type=subject_type,
                        subject_id=subject_id,
                        entity_kind=OBJECT_ENTITY_KIND,
                        entity_id=obj.id,
                        link_kind=role,
                    )
                )

    role = primary_role(after)
    primary = after[role] if role else RoleHolder()
    if (primary.team_id, primary.contact_id) != (obj.owner_team_id, obj.point_of_contact_id):
        await apply_ownership_write_resolved(
            db,
            obj,
            workspace_id=obj.workspace_id,
            org_id=obj.org_id,
            user_id=user_id,
            owner_team_id=primary.team_id,
            owner_team_name=names.get(primary.team_id) if primary.team_id else None,
            point_of_contact_id=primary.contact_id,
            point_of_contact_name=names.get(primary.contact_id) if primary.contact_id else None,
        )

    db.add(
        ChangeLog(
            workspace_id=obj.workspace_id,
            org_id=obj.org_id,
            object_id=obj.id,
            object_type=obj.type,
            action="updated",
            diff={
                "action_type": "updated_fields",
                "changes": {"ownership": {"old": describe(before.roles, names), "new": describe(after, names)}},
            },
            performed_by=user_id,
        )
    )
    return True


def describe(roles: dict[str, RoleHolder], names: dict[uuid.UUID, str]) -> str:
    parts = []
    for role in ROLE_KINDS:
        h = roles.get(role)
        if not h or h.empty():
            continue
        who = " · ".join(names.get(i, "Unknown") for i in (h.team_id, h.contact_id) if i)
        parts.append(f"{ROLE_LABELS[role]}: {who}")
    return "; ".join(parts) or "No owner"


def apply_bulk(
    current: ObjectRoles,
    *,
    action: str,
    role: str | None,
    subject_type: str,
    subject_id: uuid.UUID,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
) -> dict[str, RoleHolder]:
    """Pure: the roles after one assign / move / remove on one record."""
    roles = {r: RoleHolder(h.team_id, h.contact_id) for r, h in current.roles.items()}
    key = "team_id" if subject_type == "team" else "contact_id"

    def held(r: str) -> bool:
        return getattr(roles.get(r, RoleHolder()), key) == subject_id

    if action == "assign":
        assert role
        roles.setdefault(role, RoleHolder())
        setattr(roles[role], key, subject_id)
        return roles
    affected = [r for r in ROLE_KINDS if (role is None or r == role) and held(r)]
    for r in affected:
        setattr(roles[r], key, None)
        if action == "move":
            assert target_type and target_id
            setattr(roles[r], "team_id" if target_type == "team" else "contact_id", target_id)
    return roles


async def remove_owner_everywhere(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    subject_type: str,
    subject_id: uuid.UUID,
    *,
    user_id: uuid.UUID | None,
) -> int:
    """Before a team or contact is deleted: take it off every role and re-sync each record's primary owner."""
    entity_ids = list(
        (
            await db.execute(
                select(PeopleAccountability.entity_id).where(
                    PeopleAccountability.workspace_id == workspace_id,
                    PeopleAccountability.org_id == org_id,
                    PeopleAccountability.entity_kind == OBJECT_ENTITY_KIND,
                    PeopleAccountability.link_kind.in_(ROLE_KINDS),
                    PeopleAccountability.subject_type == subject_type,
                    PeopleAccountability.subject_id == subject_id,
                )
            )
        ).scalars()
    )
    if not entity_ids:
        return 0
    objects = (
        await db.execute(
            select(MinEAObject).where(
                MinEAObject.id.in_(entity_ids), MinEAObject.workspace_id == workspace_id, MinEAObject.org_id == org_id
            )
        )
    ).scalars().all()
    rows = await load_role_rows(db, workspace_id, org_id, [o.id for o in objects])
    names: dict[uuid.UUID, str] = {}
    for model in (Team, PeopleContact):
        for item in (await db.execute(select(model).where(model.workspace_id == workspace_id, model.org_id == org_id))).scalars():
            names[item.id] = item.name
    changed = 0
    for obj in objects:
        before = roles_from_rows(obj, rows.get(obj.id, []))
        after = apply_bulk(before, action="remove", role=None, subject_type=subject_type, subject_id=subject_id)
        if await write_roles(db, obj, before, after, user_id=user_id, names=names):
            changed += 1
    # Rows on records that no longer exist.
    await db.execute(
        delete(PeopleAccountability).where(
            PeopleAccountability.workspace_id == workspace_id,
            PeopleAccountability.org_id == org_id,
            PeopleAccountability.entity_kind == OBJECT_ENTITY_KIND,
            PeopleAccountability.link_kind.in_(ROLE_KINDS),
            PeopleAccountability.subject_type == subject_type,
            PeopleAccountability.subject_id == subject_id,
        )
    )
    return changed
