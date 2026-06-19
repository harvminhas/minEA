from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.people import PeopleAccountability, PeopleContact, PeopleRole, Team, TeamRoleAssignment
from app.schemas.people import (
    AccountabilityCreate,
    AccountabilityUpdate,
    AddRoleToTeamCreate,
    PeopleContactCreate,
    PeopleContactDetail,
    PeopleContactListResponse,
    PeopleContactRead,
    PeopleContactUpdate,
    ContactAssignmentRead,
    PeopleRoleCreate,
    PeopleRoleDetail,
    PeopleRoleListResponse,
    PeopleRoleRead,
    PeopleRoleUpdate,
    TeamCreate,
    TeamDetail,
    TeamListResponse,
    TeamRead,
    TeamRoleAssignmentCreate,
    TeamRoleAssignmentUpdate,
    TeamUpdate,
)
from app.services.contact_assignments import load_contact_assignments
from app.services.people import (
    load_accountabilities,
    load_role_teams,
    load_team_roles,
    validate_accountability_entity,
)
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/people",
    tags=["people"],
)


async def _role_read(db: AsyncSession, role: PeopleRole) -> PeopleRoleRead:
    team_count = await db.scalar(
        select(func.count()).select_from(TeamRoleAssignment).where(TeamRoleAssignment.people_role_id == role.id)
    )
    return PeopleRoleRead(
        id=role.id,
        workspace_id=role.workspace_id,
        org_id=role.org_id,
        name=role.name,
        role_kind=role.role_kind,
        description=role.description,
        team_count=team_count or 0,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


async def _team_read(db: AsyncSession, team: Team) -> TeamRead:
    role_count = await db.scalar(
        select(func.count()).select_from(TeamRoleAssignment).where(TeamRoleAssignment.team_id == team.id)
    )
    return TeamRead(
        id=team.id,
        workspace_id=team.workspace_id,
        org_id=team.org_id,
        name=team.name,
        description=team.description,
        lead_name=team.lead_name,
        lead_email=team.lead_email,
        role_count=role_count or 0,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


# ─── Roles ───────────────────────────────────────────────────────────────────


@router.get("/roles", response_model=PeopleRoleListResponse)
async def list_roles(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleRoleListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleRole)
        .where(PeopleRole.workspace_id == ctx.workspace.id, PeopleRole.org_id == ctx.org_id)
        .order_by(PeopleRole.name)
    )
    roles = result.scalars().all()
    items = [await _role_read(db, role) for role in roles]
    return PeopleRoleListResponse(items=items, total=len(items))


@router.post("/roles", response_model=PeopleRoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: PeopleRoleCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleRoleRead:
    await ctx.require_write(db)
    assert ctx.workspace

    role = PeopleRole(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        name=body.name.strip(),
        role_kind=body.role_kind,
        description=body.description,
        created_by=ctx.user_id,
    )
    db.add(role)
    await db.flush()
    return await _role_read(db, role)


@router.get("/roles/{role_id}", response_model=PeopleRoleDetail)
async def get_role(
    role_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleRoleDetail:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleRole).where(
            PeopleRole.id == role_id,
            PeopleRole.workspace_id == ctx.workspace.id,
            PeopleRole.org_id == ctx.org_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    base = await _role_read(db, role)
    teams = await load_role_teams(db, role)
    accountabilities = await load_accountabilities(db, ctx.workspace.id, ctx.org_id, "role", role.id)
    return PeopleRoleDetail(**base.model_dump(), teams=teams, accountabilities=accountabilities)


@router.put("/roles/{role_id}", response_model=PeopleRoleRead)
async def update_role(
    role_id: UUID,
    body: PeopleRoleUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleRoleRead:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleRole).where(
            PeopleRole.id == role_id,
            PeopleRole.workspace_id == ctx.workspace.id,
            PeopleRole.org_id == ctx.org_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    if body.name is not None:
        role.name = body.name.strip()
    if body.role_kind is not None:
        role.role_kind = body.role_kind
    if body.description is not None:
        role.description = body.description
    await db.flush()
    return await _role_read(db, role)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleRole).where(
            PeopleRole.id == role_id,
            PeopleRole.workspace_id == ctx.workspace.id,
            PeopleRole.org_id == ctx.org_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    await db.delete(role)


@router.post("/roles/{role_id}/teams", status_code=status.HTTP_204_NO_CONTENT)
async def link_role_to_team(
    role_id: UUID,
    body: AddRoleToTeamCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    role_result = await db.execute(
        select(PeopleRole).where(
            PeopleRole.id == role_id,
            PeopleRole.workspace_id == ctx.workspace.id,
            PeopleRole.org_id == ctx.org_id,
        )
    )
    if not role_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    team_result = await db.execute(
        select(Team).where(
            Team.id == body.team_id,
            Team.workspace_id == ctx.workspace.id,
            Team.org_id == ctx.org_id,
        )
    )
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    existing = await db.execute(
        select(TeamRoleAssignment).where(
            TeamRoleAssignment.team_id == body.team_id,
            TeamRoleAssignment.people_role_id == role_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already on team")

    db.add(
        TeamRoleAssignment(
            team_id=body.team_id,
            people_role_id=role_id,
            assignee_name=body.assignee_name,
            assignee_email=body.assignee_email,
            assignment_kind=body.assignment_kind,
        )
    )


@router.post("/roles/{role_id}/accountabilities", status_code=status.HTTP_204_NO_CONTENT)
async def add_role_accountability(
    role_id: UUID,
    body: AccountabilityCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleRole).where(
            PeopleRole.id == role_id,
            PeopleRole.workspace_id == ctx.workspace.id,
            PeopleRole.org_id == ctx.org_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    try:
        await validate_accountability_entity(
            db, ctx.workspace.id, ctx.org_id, body.entity_kind, body.entity_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.add(
        PeopleAccountability(
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            subject_type="role",
            subject_id=role_id,
            entity_kind=body.entity_kind,
            entity_id=body.entity_id,
            link_kind=body.link_kind,
        )
    )


async def _contact_read(db: AsyncSession, contact: PeopleContact) -> PeopleContactRead:
    team_name: str | None = None
    if contact.team_id:
        result = await db.execute(select(Team.name).where(Team.id == contact.team_id))
        team_name = result.scalar_one_or_none()
    return PeopleContactRead(
        id=contact.id,
        workspace_id=contact.workspace_id,
        org_id=contact.org_id,
        name=contact.name,
        email=contact.email,
        team_id=contact.team_id,
        team_name=team_name,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


async def _contact_detail(db: AsyncSession, contact: PeopleContact) -> PeopleContactDetail:
    base = await _contact_read(db, contact)
    assignments = await load_contact_assignments(
        db, contact.workspace_id, contact.org_id, contact.id
    )
    return PeopleContactDetail(**base.model_dump(), assignments=assignments)


# ─── Contacts ────────────────────────────────────────────────────────────────


@router.get("/contacts", response_model=PeopleContactListResponse)
async def list_contacts(
    team_id: UUID | None = None,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleContactListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    q = select(PeopleContact).where(
        PeopleContact.workspace_id == ctx.workspace.id,
        PeopleContact.org_id == ctx.org_id,
    )
    if team_id:
        q = q.where((PeopleContact.team_id == team_id) | (PeopleContact.team_id.is_(None)))
    result = await db.execute(q.order_by(PeopleContact.name))
    contacts = result.scalars().all()
    items = [await _contact_read(db, contact) for contact in contacts]
    return PeopleContactListResponse(items=items, total=len(items))


@router.post("/contacts", response_model=PeopleContactRead, status_code=status.HTTP_201_CREATED)
async def create_contact(
    body: PeopleContactCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleContactRead:
    await ctx.require_write(db)
    assert ctx.workspace

    if body.team_id:
        team_result = await db.execute(
            select(Team.id).where(
                Team.id == body.team_id,
                Team.workspace_id == ctx.workspace.id,
                Team.org_id == ctx.org_id,
            )
        )
        if not team_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team not found")

    contact = PeopleContact(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        name=body.name.strip(),
        email=body.email,
        team_id=body.team_id,
        created_by=ctx.user_id,
    )
    db.add(contact)
    await db.flush()
    await db.refresh(contact)
    return await _contact_read(db, contact)


@router.get("/contacts/{contact_id}", response_model=PeopleContactDetail)
async def get_contact(
    contact_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleContactDetail:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleContact).where(
            PeopleContact.id == contact_id,
            PeopleContact.workspace_id == ctx.workspace.id,
            PeopleContact.org_id == ctx.org_id,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return await _contact_detail(db, contact)


@router.put("/contacts/{contact_id}", response_model=PeopleContactRead)
async def update_contact(
    contact_id: UUID,
    body: PeopleContactUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> PeopleContactRead:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleContact).where(
            PeopleContact.id == contact_id,
            PeopleContact.workspace_id == ctx.workspace.id,
            PeopleContact.org_id == ctx.org_id,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if body.team_id is not None:
        if body.team_id:
            team_result = await db.execute(
                select(Team.id).where(
                    Team.id == body.team_id,
                    Team.workspace_id == ctx.workspace.id,
                    Team.org_id == ctx.org_id,
                )
            )
            if not team_result.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team not found")
        contact.team_id = body.team_id
    if body.name is not None:
        contact.name = body.name.strip()
    if body.email is not None:
        contact.email = body.email

    await db.flush()
    await db.refresh(contact)
    return await _contact_read(db, contact)


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleContact).where(
            PeopleContact.id == contact_id,
            PeopleContact.workspace_id == ctx.workspace.id,
            PeopleContact.org_id == ctx.org_id,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    await db.delete(contact)


# ─── Teams ───────────────────────────────────────────────────────────────────


@router.get("/teams", response_model=TeamListResponse)
async def list_teams(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> TeamListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(Team)
        .where(Team.workspace_id == ctx.workspace.id, Team.org_id == ctx.org_id)
        .order_by(Team.name)
    )
    teams = result.scalars().all()
    items = [await _team_read(db, team) for team in teams]
    return TeamListResponse(items=items, total=len(items))


@router.post("/teams", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> TeamRead:
    await ctx.require_write(db)
    assert ctx.workspace

    team = Team(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        name=body.name.strip(),
        description=body.description,
        lead_name=body.lead_name,
        lead_email=body.lead_email,
        created_by=ctx.user_id,
    )
    db.add(team)
    await db.flush()
    return await _team_read(db, team)


@router.get("/teams/{team_id}", response_model=TeamDetail)
async def get_team(
    team_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> TeamDetail:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(Team).where(
            Team.id == team_id,
            Team.workspace_id == ctx.workspace.id,
            Team.org_id == ctx.org_id,
        )
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    base = await _team_read(db, team)
    roles = await load_team_roles(db, team)
    accountabilities = await load_accountabilities(db, ctx.workspace.id, ctx.org_id, "team", team.id)
    return TeamDetail(**base.model_dump(), roles=roles, accountabilities=accountabilities)


@router.put("/teams/{team_id}", response_model=TeamRead)
async def update_team(
    team_id: UUID,
    body: TeamUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> TeamRead:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(Team).where(
            Team.id == team_id,
            Team.workspace_id == ctx.workspace.id,
            Team.org_id == ctx.org_id,
        )
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if body.name is not None:
        team.name = body.name.strip()
    if body.description is not None:
        team.description = body.description
    if body.lead_name is not None:
        team.lead_name = body.lead_name
    if body.lead_email is not None:
        team.lead_email = body.lead_email
    await db.flush()
    return await _team_read(db, team)


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(Team).where(
            Team.id == team_id,
            Team.workspace_id == ctx.workspace.id,
            Team.org_id == ctx.org_id,
        )
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    await db.delete(team)


@router.post("/teams/{team_id}/roles", status_code=status.HTTP_204_NO_CONTENT)
async def add_team_role(
    team_id: UUID,
    body: TeamRoleAssignmentCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    team_result = await db.execute(
        select(Team).where(
            Team.id == team_id,
            Team.workspace_id == ctx.workspace.id,
            Team.org_id == ctx.org_id,
        )
    )
    if not team_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    role_result = await db.execute(
        select(PeopleRole).where(
            PeopleRole.id == body.people_role_id,
            PeopleRole.workspace_id == ctx.workspace.id,
            PeopleRole.org_id == ctx.org_id,
        )
    )
    if not role_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    existing = await db.execute(
        select(TeamRoleAssignment).where(
            TeamRoleAssignment.team_id == team_id,
            TeamRoleAssignment.people_role_id == body.people_role_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already on team")

    db.add(
        TeamRoleAssignment(
            team_id=team_id,
            people_role_id=body.people_role_id,
            assignee_name=body.assignee_name,
            assignee_email=body.assignee_email,
            assignment_kind=body.assignment_kind,
        )
    )


@router.put("/teams/{team_id}/roles/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_team_role(
    team_id: UUID,
    assignment_id: UUID,
    body: TeamRoleAssignmentUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(TeamRoleAssignment).where(
            TeamRoleAssignment.id == assignment_id,
            TeamRoleAssignment.team_id == team_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    if body.assignee_name is not None:
        assignment.assignee_name = body.assignee_name
    if body.assignee_email is not None:
        assignment.assignee_email = body.assignee_email
    if body.assignment_kind is not None:
        assignment.assignment_kind = body.assignment_kind


@router.post("/teams/{team_id}/accountabilities", status_code=status.HTTP_204_NO_CONTENT)
async def add_team_accountability(
    team_id: UUID,
    body: AccountabilityCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(Team).where(
            Team.id == team_id,
            Team.workspace_id == ctx.workspace.id,
            Team.org_id == ctx.org_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    try:
        await validate_accountability_entity(
            db, ctx.workspace.id, ctx.org_id, body.entity_kind, body.entity_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.add(
        PeopleAccountability(
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            subject_type="team",
            subject_id=team_id,
            entity_kind=body.entity_kind,
            entity_id=body.entity_id,
            link_kind=body.link_kind,
        )
    )


@router.delete("/accountabilities/{accountability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_accountability(
    accountability_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleAccountability).where(
            PeopleAccountability.id == accountability_id,
            PeopleAccountability.workspace_id == ctx.workspace.id,
            PeopleAccountability.org_id == ctx.org_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accountability not found")
    await db.delete(row)


@router.patch("/accountabilities/{accountability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_accountability(
    accountability_id: UUID,
    body: AccountabilityUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(PeopleAccountability).where(
            PeopleAccountability.id == accountability_id,
            PeopleAccountability.workspace_id == ctx.workspace.id,
            PeopleAccountability.org_id == ctx.org_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accountability not found")

    if body.link_kind == row.link_kind:
        return

    dup = await db.execute(
        select(PeopleAccountability.id).where(
            PeopleAccountability.workspace_id == ctx.workspace.id,
            PeopleAccountability.org_id == ctx.org_id,
            PeopleAccountability.subject_type == row.subject_type,
            PeopleAccountability.subject_id == row.subject_id,
            PeopleAccountability.entity_kind == row.entity_kind,
            PeopleAccountability.entity_id == row.entity_id,
            PeopleAccountability.link_kind == body.link_kind,
            PeopleAccountability.id != accountability_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This relationship already exists for the entity",
        )

    row.link_kind = body.link_kind
