"""Owners & Teams: per-role owners on catalog records (Business owner, Technical owner, Support team)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import MinEAObject
from app.models.people import PeopleContact, Team
from app.schemas.ownership_roles import (
    ObjectOwnershipRead,
    ObjectOwnershipWrite,
    OwnershipBulkRequest,
    OwnershipBulkResponse,
    OwnershipListResponse,
    RoleOwnerRead,
)
from app.services.audit import log_audit
from app.services.ownership_roles import (
    ObjectRoles,
    OwnershipError,
    RoleHolder,
    apply_bulk,
    check_subject,
    is_owned,
    load_role_rows,
    roles_from_rows,
    write_roles,
)
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/ownership",
    tags=["ownership"],
)

# Records that are findings about other records, not things with owners.
_SKIP_TYPES = {"tech_debt"}


async def _people(db: AsyncSession, workspace_id: UUID, org_id: UUID):
    teams = {
        t.id: t
        for t in (await db.execute(select(Team).where(Team.workspace_id == workspace_id, Team.org_id == org_id))).scalars()
    }
    contacts = {
        c.id: c
        for c in (
            await db.execute(select(PeopleContact).where(PeopleContact.workspace_id == workspace_id, PeopleContact.org_id == org_id))
        ).scalars()
    }
    names = {**{i: t.name for i, t in teams.items()}, **{i: c.name for i, c in contacts.items()}}
    return teams, contacts, names


def _read(obj: MinEAObject, roles: ObjectRoles, teams: dict, contacts: dict) -> ObjectOwnershipRead:
    out: dict[str, RoleOwnerRead] = {}
    for role, holder in roles.roles.items():
        if holder.empty():
            continue
        team = teams.get(holder.team_id) if holder.team_id else None
        contact = contacts.get(holder.contact_id) if holder.contact_id else None
        read = RoleOwnerRead(
            team_id=holder.team_id,
            team_name=team.name if team else (obj.owner if roles.implicit and holder.team_id else None),
            contact_id=holder.contact_id,
            contact_name=contact.name if contact else (obj.point_of_contact_name if roles.implicit else None),
        )
        if not holder.contact_id and team:
            lead = contacts.get(team.lead_contact_id) if team.lead_contact_id else None
            lead_name = lead.name if lead else (team.lead_name or "").strip() or None
            if lead_name:
                read.contact_id = lead.id if lead else None
                read.contact_name = lead_name
                read.contact_is_lead = True
        out[role] = read
    props = obj.properties or {}
    return ObjectOwnershipRead(
        object_id=obj.id,
        name=obj.name,
        type=obj.type,
        category=str(props.get("category")) if obj.type == "application" and props.get("category") else None,
        roles=out,
        # Free-text owner from before teams existed (no team or contact id behind it).
        legacy_owner=None if (obj.owner_team_id or obj.point_of_contact_id) else ((obj.owner or "").strip() or None),
        owned=is_owned(obj, roles),
    )


@router.get("", response_model=OwnershipListResponse)
async def list_ownership(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> OwnershipListResponse:
    """Every record with its role owners, plus how many have no owner at all."""
    await ctx.require_read(db)
    assert ctx.workspace
    objects = (
        await db.execute(
            select(MinEAObject)
            .where(MinEAObject.workspace_id == ctx.workspace.id, MinEAObject.org_id == ctx.org_id)
            .order_by(MinEAObject.name)
        )
    ).scalars().all()
    rows = await load_role_rows(db, ctx.workspace.id, ctx.org_id)
    teams, contacts, _ = await _people(db, ctx.workspace.id, ctx.org_id)
    items = [_read(o, roles_from_rows(o, rows.get(o.id, [])), teams, contacts) for o in objects if o.type not in _SKIP_TYPES]
    return OwnershipListResponse(items=items, unowned_count=sum(1 for i in items if not i.owned))


async def _load_objects(db: AsyncSession, ctx: TenancyContext, ids: list[UUID]) -> list[MinEAObject]:
    assert ctx.workspace
    found = (
        await db.execute(
            select(MinEAObject)
            .where(MinEAObject.id.in_(ids), MinEAObject.workspace_id == ctx.workspace.id, MinEAObject.org_id == ctx.org_id)
            .with_for_update()
        )
    ).scalars().all()
    if len({o.id for o in found}) != len(set(ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Some records were not found")
    return list(found)


@router.post("/bulk", response_model=OwnershipBulkResponse)
async def bulk_ownership(
    body: OwnershipBulkRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> OwnershipBulkResponse:
    """Assign, move or remove one owner across many records in one transaction."""
    await ctx.require_write(db)
    assert ctx.workspace
    try:
        await check_subject(db, ctx.workspace.id, ctx.org_id, body.owner.type, body.owner.id)
        if body.target:
            await check_subject(db, ctx.workspace.id, ctx.org_id, body.target.type, body.target.id)
    except OwnershipError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    objects = await _load_objects(db, ctx, body.object_ids)
    rows = await load_role_rows(db, ctx.workspace.id, ctx.org_id, [o.id for o in objects])
    _, _, names = await _people(db, ctx.workspace.id, ctx.org_id)
    changed = 0
    for obj in objects:
        before = roles_from_rows(obj, rows.get(obj.id, []))
        after = apply_bulk(
            before,
            action=body.action,
            role=body.role,
            subject_type=body.owner.type,
            subject_id=body.owner.id,
            target_type=body.target.type if body.target else None,
            target_id=body.target.id if body.target else None,
        )
        if await write_roles(db, obj, before, after, user_id=ctx.user_id, names=names):
            changed += 1

    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action=f"ownership.{body.action}",
        target_type=body.owner.type,
        target_id=body.owner.id,
        metadata={
            "workspace_id": str(ctx.workspace.id),
            "role": body.role,
            "target": {"type": body.target.type, "id": str(body.target.id)} if body.target else None,
            "object_ids": [str(o.id) for o in objects],
            "changed": changed,
        },
    )
    if changed:
        await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    return OwnershipBulkResponse(changed=changed)


@router.put("/objects/{object_id}", response_model=ObjectOwnershipRead)
async def set_object_ownership(
    object_id: UUID,
    body: ObjectOwnershipWrite,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ObjectOwnershipRead:
    """Set all three roles on one record (the record's Ownership editor)."""
    await ctx.require_write(db)
    assert ctx.workspace
    after: dict[str, RoleHolder] = {}
    try:
        for role, ref in body.roles.items():
            if not ref:
                continue
            if ref.team_id:
                await check_subject(db, ctx.workspace.id, ctx.org_id, "team", ref.team_id)
            if ref.contact_id:
                await check_subject(db, ctx.workspace.id, ctx.org_id, "contact", ref.contact_id)
            after[role] = RoleHolder(ref.team_id, ref.contact_id)
    except OwnershipError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    (obj,) = await _load_objects(db, ctx, [object_id])
    rows = await load_role_rows(db, ctx.workspace.id, ctx.org_id, [obj.id])
    teams, contacts, names = await _people(db, ctx.workspace.id, ctx.org_id)
    before = roles_from_rows(obj, rows.get(obj.id, []))
    if await write_roles(db, obj, before, after, user_id=ctx.user_id, names=names):
        await log_audit(
            db,
            org_id=ctx.org_id,
            actor_user_id=ctx.user_id,
            action="ownership.set",
            target_type="object",
            target_id=obj.id,
            metadata={"workspace_id": str(ctx.workspace.id), "roles": ObjectRoles(roles=after).snapshot()},
        )
        await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
        await db.flush()
    rows = await load_role_rows(db, ctx.workspace.id, ctx.org_id, [obj.id])
    return _read(obj, roles_from_rows(obj, rows.get(obj.id, [])), teams, contacts)
