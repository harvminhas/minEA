from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.objects import MinEAObject
from app.models.views_graph import CustomerJourney, JourneyMoment, MomentProcess, MomentSystem, Process
from app.schemas.journeys import (
    DerivedSystemsResponse,
    JourneyCreate,
    JourneyListResponse,
    JourneyRead,
    JourneyUpdate,
    JourneyStepRead,
)
from app.services.owner_fields import apply_ownership_write_resolved, ownership_from_body, ownership_read_payload
from app.services.journey_systems import derive_systems_for_processes
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/journeys",
    tags=["journeys"],
)


async def _validate_process_ids(
    db: AsyncSession, workspace_id: UUID, org_id: UUID, process_ids: list[UUID]
) -> None:
    if not process_ids:
        return
    result = await db.execute(
        select(Process.id).where(
            Process.id.in_(process_ids),
            Process.workspace_id == workspace_id,
            Process.org_id == org_id,
        )
    )
    found = {row[0] for row in result.all()}
    missing = set(process_ids) - found
    if missing:
        raise ValueError(f"Invalid process ids: {missing}")


async def _validate_system_ids(
    db: AsyncSession, workspace_id: UUID, org_id: UUID, system_ids: list[UUID]
) -> None:
    if not system_ids:
        return
    result = await db.execute(
        select(MinEAObject.id).where(
            MinEAObject.id.in_(system_ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "application",
        )
    )
    found = {row[0] for row in result.all()}
    missing = set(system_ids) - found
    if missing:
        raise ValueError(f"Invalid system ids: {missing}")


def _step_to_read(step: JourneyMoment) -> JourneyStepRead:
    return JourneyStepRead(
        id=step.id,
        title=step.name,
        position=step.position,
        channel=step.channel or step.touchpoint_type,
        goal=step.goal,
        pain_points=step.pain_points or step.friction_notes,
        **ownership_read_payload(step),
        ai_opportunities=step.ai_opportunities,
        sentiment_friction=step.sentiment_friction or step.emotion,
        process_ids=[mp.process_id for mp in step.processes],
        system_ids=[ms.system_id for ms in step.systems],
    )


async def _to_read(journey: CustomerJourney) -> JourneyRead:
    steps = sorted(journey.steps, key=lambda s: s.position)
    process_ids = {pid for step in steps for pid in [p.process_id for p in step.processes]}
    return JourneyRead(
        id=journey.id,
        workspace_id=journey.workspace_id,
        org_id=journey.org_id,
        name=journey.name,
        **ownership_read_payload(journey),
        status=journey.status,
        customer_segment=journey.customer_segment,
        description=journey.description,
        step_count=len(steps),
        process_count=len(process_ids),
        steps=[_step_to_read(s) for s in steps],
        canvas_layout=journey.canvas_layout,
        graph_edges=journey.graph_edges,
        created_at=journey.created_at,
        updated_at=journey.updated_at,
    )


async def _load_journey(
    db: AsyncSession, journey_id: UUID, workspace_id: UUID, org_id: UUID
) -> CustomerJourney | None:
    result = await db.execute(
        select(CustomerJourney)
        .options(
            selectinload(CustomerJourney.steps)
            .selectinload(JourneyMoment.processes),
            selectinload(CustomerJourney.steps)
            .selectinload(JourneyMoment.systems),
        )
        .where(
            CustomerJourney.id == journey_id,
            CustomerJourney.workspace_id == workspace_id,
            CustomerJourney.org_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def _apply_steps(
    db: AsyncSession,
    journey: CustomerJourney,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    steps_data: list,
) -> None:
    await db.execute(delete(JourneyMoment).where(JourneyMoment.journey_id == journey.id))
    await db.flush()
    db.expire(journey, ["steps"])

    for step_data in steps_data:
        try:
            await _validate_process_ids(db, workspace_id, org_id, step_data.process_ids)
            await _validate_system_ids(db, workspace_id, org_id, step_data.system_ids)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        step = JourneyMoment(
            journey_id=journey.id,
            name=step_data.title,
            position=step_data.position,
            channel=step_data.channel,
            goal=step_data.goal,
            pain_points=step_data.pain_points,
            owner=None,
            ai_opportunities=step_data.ai_opportunities,
            sentiment_friction=step_data.sentiment_friction,
            touchpoint_type=step_data.channel,
            friction_notes=step_data.pain_points,
            emotion=step_data.sentiment_friction,
        )
        await apply_ownership_write_resolved(
            db,
            step,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            **ownership_from_body(step_data),
        )
        db.add(step)
        await db.flush()

        for process_id in step_data.process_ids:
            db.add(MomentProcess(moment_id=step.id, process_id=process_id))
        for system_id in step_data.system_ids:
            db.add(MomentSystem(moment_id=step.id, system_id=system_id))


@router.get("", response_model=JourneyListResponse)
async def list_journeys(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> JourneyListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(CustomerJourney)
        .options(
            selectinload(CustomerJourney.steps).selectinload(JourneyMoment.processes),
            selectinload(CustomerJourney.steps).selectinload(JourneyMoment.systems),
        )
        .where(CustomerJourney.workspace_id == ctx.workspace.id, CustomerJourney.org_id == ctx.org_id)
        .order_by(CustomerJourney.name)
    )
    journeys = result.scalars().unique().all()
    items = [await _to_read(j) for j in journeys]
    return JourneyListResponse(items=items, total=len(items))


@router.get("/derive-systems", response_model=DerivedSystemsResponse)
async def derive_systems(
    process_ids: list[UUID] = Query(default_factory=list),
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DerivedSystemsResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    items = await derive_systems_for_processes(db, ctx.workspace.id, ctx.org_id, process_ids)
    return DerivedSystemsResponse(items=items)


@router.post("", response_model=JourneyRead, status_code=status.HTTP_201_CREATED)
async def create_journey(
    body: JourneyCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> JourneyRead:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace

    journey = CustomerJourney(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        name=body.name,
        owner=None,
        status=body.status,
        customer_segment=body.customer_segment,
        description=body.description,
        canvas_layout=body.canvas_layout,
        graph_edges=body.graph_edges,
    )
    await apply_ownership_write_resolved(
        db,
        journey,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        **ownership_from_body(body),
    )
    db.add(journey)
    await db.flush()

    if body.steps:
        await _apply_steps(db, journey, ctx.workspace.id, ctx.org_id, ctx.user_id, body.steps)

    await db.flush()
    refreshed = await _load_journey(db, journey.id, ctx.workspace.id, ctx.org_id)
    assert refreshed
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    return await _to_read(refreshed)


@router.get("/{journey_id}", response_model=JourneyRead)
async def get_journey(
    journey_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> JourneyRead:
    await ctx.require_read(db)
    assert ctx.workspace

    journey = await _load_journey(db, journey_id, ctx.workspace.id, ctx.org_id)
    if not journey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journey not found")
    return await _to_read(journey)


@router.patch("/{journey_id}", response_model=JourneyRead)
async def update_journey(
    journey_id: UUID,
    body: JourneyUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> JourneyRead:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    journey = await _load_journey(db, journey_id, ctx.workspace.id, ctx.org_id)
    if not journey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journey not found")

    updates = body.model_dump(exclude_unset=True)
    if body.steps is not None:
        await _apply_steps(db, journey, ctx.workspace.id, ctx.org_id, ctx.user_id, body.steps)

    ownership_updates = {
        k: updates.pop(k)
        for k in list(updates)
        if k
        in {
            "owner",
            "owner_team_id",
            "owner_team_name",
            "point_of_contact_id",
            "point_of_contact_name",
        }
    }
    if ownership_updates:
        await apply_ownership_write_resolved(
            db,
            journey,
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            user_id=ctx.user_id,
            **ownership_updates,
        )

    for field in (
        "name",
        "status",
        "customer_segment",
        "description",
        "canvas_layout",
        "graph_edges",
    ):
        if field not in updates:
            continue
        setattr(journey, field, updates[field])

    await db.flush()
    refreshed = await _load_journey(db, journey.id, ctx.workspace.id, ctx.org_id)
    assert refreshed
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    return await _to_read(refreshed)
