from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.objects import MinEAObject
from app.models.views_graph import Process, Stage, StageCapability
from app.schemas.processes import ProcessCreate, ProcessListResponse, ProcessRead, ProcessUpdate, StageRead
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/processes",
    tags=["processes"],
)


async def _validate_capability_ids(
    db: AsyncSession, workspace_id: UUID, org_id: UUID, capability_ids: list[UUID]
) -> None:
    if not capability_ids:
        return
    result = await db.execute(
        select(MinEAObject.id).where(
            MinEAObject.id.in_(capability_ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "capability",
        )
    )
    found = {row[0] for row in result.all()}
    missing = set(capability_ids) - found
    if missing:
        raise ValueError(f"Invalid capability ids: {missing}")


def _stage_to_read(stage: Stage) -> StageRead:
    return StageRead(
        id=stage.id,
        name=stage.name,
        position=stage.position,
        owner=stage.owner,
        cycle_time_target=stage.cycle_time_target,
        typical_duration=stage.typical_duration,
        transition_condition=stage.transition_condition,
        transition_trigger=stage.transition_trigger,
        transition_handoff=stage.transition_handoff,
        capability_ids=[sc.capability_id for sc in stage.capabilities],
    )


async def _to_read(process: Process) -> ProcessRead:
    stages = sorted(process.stages, key=lambda s: s.position)
    cap_count = sum(len(s.capabilities) for s in stages)
    return ProcessRead(
        id=process.id,
        workspace_id=process.workspace_id,
        org_id=process.org_id,
        name=process.name,
        owner=process.owner,
        status=process.status,
        description=process.description,
        trigger_event=process.trigger_event,
        value_delivered=process.value_delivered,
        stage_count=len(stages),
        capability_count=cap_count,
        stages=[_stage_to_read(s) for s in stages],
        canvas_layout=process.canvas_layout,
        graph_edges=process.graph_edges,
        created_at=process.created_at,
        updated_at=process.updated_at,
    )


async def _load_process(
    db: AsyncSession, process_id: UUID, workspace_id: UUID, org_id: UUID
) -> Process | None:
    result = await db.execute(
        select(Process)
        .options(selectinload(Process.stages).selectinload(Stage.capabilities))
        .where(
            Process.id == process_id,
            Process.workspace_id == workspace_id,
            Process.org_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def _apply_stages(
    db: AsyncSession,
    process: Process,
    workspace_id: UUID,
    org_id: UUID,
    stages_data: list,
) -> None:
    # Do not use process.stages.clear() — it triggers sync lazy-load IO in async sessions.
    await db.execute(delete(Stage).where(Stage.process_id == process.id))
    await db.flush()
    db.expire(process, ["stages"])

    for stage_data in stages_data:
        try:
            await _validate_capability_ids(db, workspace_id, org_id, stage_data.capability_ids)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        stage = Stage(
            process_id=process.id,
            name=stage_data.name,
            position=stage_data.position,
            owner=stage_data.owner,
            cycle_time_target=stage_data.cycle_time_target,
            typical_duration=stage_data.typical_duration,
            transition_condition=stage_data.transition_condition,
            transition_trigger=stage_data.transition_trigger,
            transition_handoff=stage_data.transition_handoff,
        )
        db.add(stage)
        await db.flush()

        for cap_id in stage_data.capability_ids:
            db.add(StageCapability(stage_id=stage.id, capability_id=cap_id))


@router.get("", response_model=ProcessListResponse)
async def list_processes(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProcessListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(Process)
        .options(selectinload(Process.stages).selectinload(Stage.capabilities))
        .where(Process.workspace_id == ctx.workspace.id, Process.org_id == ctx.org_id)
        .order_by(Process.name)
    )
    processes = result.scalars().unique().all()
    items = [await _to_read(p) for p in processes]
    return ProcessListResponse(items=items, total=len(items))


@router.post("", response_model=ProcessRead, status_code=status.HTTP_201_CREATED)
async def create_process(
    body: ProcessCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProcessRead:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace

    process = Process(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        name=body.name,
        owner=body.owner,
        status=body.status,
        description=body.description,
        trigger_event=body.trigger_event,
        value_delivered=body.value_delivered,
        canvas_layout=body.canvas_layout,
        graph_edges=body.graph_edges,
    )
    db.add(process)
    await db.flush()

    if body.stages:
        await _apply_stages(db, process, ctx.workspace.id, ctx.org_id, body.stages)

    await db.flush()
    refreshed = await _load_process(db, process.id, ctx.workspace.id, ctx.org_id)
    assert refreshed
    return await _to_read(refreshed)


@router.get("/{process_id}", response_model=ProcessRead)
async def get_process(
    process_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProcessRead:
    await ctx.require_read(db)
    assert ctx.workspace

    process = await _load_process(db, process_id, ctx.workspace.id, ctx.org_id)
    if not process:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")
    return await _to_read(process)


@router.patch("/{process_id}", response_model=ProcessRead)
async def update_process(
    process_id: UUID,
    body: ProcessUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProcessRead:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    process = await _load_process(db, process_id, ctx.workspace.id, ctx.org_id)
    if not process:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")

    if body.stages is not None:
        await _apply_stages(db, process, ctx.workspace.id, ctx.org_id, body.stages)

    for field in (
        "name",
        "owner",
        "status",
        "description",
        "trigger_event",
        "value_delivered",
        "canvas_layout",
        "graph_edges",
    ):
        value = getattr(body, field)
        if value is not None:
            setattr(process, field, value)

    await db.flush()
    refreshed = await _load_process(db, process.id, ctx.workspace.id, ctx.org_id)
    assert refreshed
    return await _to_read(refreshed)
