from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.data_layer import DataLink
from app.models.objects import MinEAObject
from app.schemas.data_layer import (
    DataDomainCreate,
    DataDomainDetail,
    DataDomainUpdate,
    DataLinkCreate,
    DataObjectCreate,
    DataObjectDetail,
    DataObjectUpdate,
    DataStoreCreate,
    DataStoreDetail,
    DataStoreUpdate,
    FlowEndpointCatalog,
)
from app.services.data_layer import (
    add_data_link,
    flow_endpoint_catalog,
    get_domain_name,
    infer_capabilities_for_entity,
    infer_domain_summary,
    infer_processes_for_entity,
    load_data_links,
    validate_link_entity,
)
from app.services.data_domain_rollup import (
    add_store_domain_assignment,
    enrich_entity_domain_links,
    get_or_create_default_data_domain,
    load_assigned_domain_id,
    load_domain_rollup,
    replace_entity_domain_assignment,
    sync_entity_domain_property,
)
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/data",
    tags=["data"],
)


def _props(obj: MinEAObject) -> dict:
    return dict(obj.properties or {})


async def _assign_entity_data_domain(
    db: AsyncSession,
    ctx: TenancyContext,
    obj: MinEAObject,
    domain_id: UUID,
) -> None:
    assert ctx.workspace
    await replace_entity_domain_assignment(
        db,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        entity_id=obj.id,
        domain_id=domain_id,
        user_id=ctx.user_id,
    )
    await sync_entity_domain_property(obj, domain_id=domain_id)
    await add_data_link(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_entity",
        obj.id,
        "data_domain",
        domain_id,
        "governed_by",
    )


async def _get_object(
    db: AsyncSession,
    ctx: TenancyContext,
    object_id: UUID,
    expected_type: str,
) -> MinEAObject:
    assert ctx.workspace
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org_id,
            MinEAObject.type == expected_type,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{expected_type} not found")
    return obj


@router.get("/flow-endpoint-catalog", response_model=FlowEndpointCatalog)
async def get_flow_endpoint_catalog(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> FlowEndpointCatalog:
    await ctx.require_read(db)
    assert ctx.workspace
    catalog = await flow_endpoint_catalog(db, ctx.workspace.id, ctx.org_id)
    return FlowEndpointCatalog(**catalog)


# ─── Data Entities ───────────────────────────────────────────────────────────


@router.post("/entities", response_model=DataObjectDetail, status_code=status.HTTP_201_CREATED)
async def create_entity(
    body: DataObjectCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataObjectDetail:
    await ctx.require_write(db)
    assert ctx.workspace

    obj = MinEAObject(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        type="data_object",
        name=body.name.strip(),
        description=body.description,
        properties={
            "classification": body.classification or "core",
            "sensitivity": body.sensitivity,
        },
        created_by=ctx.user_id,
    )
    db.add(obj)
    await db.flush()

    domain_id = body.data_domain_id
    if domain_id is None:
        default_domain = await get_or_create_default_data_domain(
            db,
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            user_id=ctx.user_id,
        )
        domain_id = default_domain.id
    await _assign_entity_data_domain(db, ctx, obj, domain_id)
    obj.properties = _props(obj)
    await db.flush()
    return await get_entity(obj.id, ctx, db)


@router.get("/entities/{entity_id}", response_model=DataObjectDetail)
async def get_entity(
    entity_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataObjectDetail:
    await ctx.require_read(db)
    assert ctx.workspace

    obj = await _get_object(db, ctx, entity_id, "data_object")
    props = _props(obj)
    domain_uuid = await load_assigned_domain_id(
        db,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        subject_id=obj.id,
        subject_type="data_object",
    )
    if domain_uuid is None:
        domain_id = props.get("data_domain_id")
        domain_uuid = UUID(str(domain_id)) if domain_id else None

    related = await load_data_links(db, ctx.workspace.id, ctx.org_id, "data_entity", obj.id, ["related"])
    links = await load_data_links(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_entity",
        obj.id,
        ["governed_by", "stored_in", "managed_by", "moved_by"],
    )
    links = await enrich_entity_domain_links(
        db,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        entity_id=obj.id,
        links=links,
    )
    explicit_caps = await load_data_links(db, ctx.workspace.id, ctx.org_id, "data_entity", obj.id, ["uses"])
    explicit_procs = await load_data_links(db, ctx.workspace.id, ctx.org_id, "data_entity", obj.id, ["reads_writes"])

    return DataObjectDetail(
        id=obj.id,
        workspace_id=obj.workspace_id,
        org_id=obj.org_id,
        name=obj.name,
        description=obj.description,
        classification=props.get("classification"),
        sensitivity=props.get("sensitivity"),
        data_domain_id=domain_uuid,
        data_domain_name=await get_domain_name(db, ctx.workspace.id, ctx.org_id, domain_uuid),
        related_entities=related,
        links=links,
        inferred_capabilities=await infer_capabilities_for_entity(
            db, ctx.workspace.id, ctx.org_id, obj.id, explicit_caps
        ),
        inferred_processes=await infer_processes_for_entity(
            db, ctx.workspace.id, ctx.org_id, obj.id, explicit_procs
        ),
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


@router.put("/entities/{entity_id}", response_model=DataObjectDetail)
async def update_entity(
    entity_id: UUID,
    body: DataObjectUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataObjectDetail:
    await ctx.require_write(db)
    obj = await _get_object(db, ctx, entity_id, "data_object")
    props = _props(obj)

    if body.name is not None:
        obj.name = body.name.strip()
    if body.description is not None:
        obj.description = body.description
    if body.classification is not None:
        props["classification"] = body.classification
    if body.sensitivity is not None:
        props["sensitivity"] = body.sensitivity
    domain_to_assign = body.data_domain_id
    if domain_to_assign is None:
        existing_domain = await load_assigned_domain_id(
            db,
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            subject_id=obj.id,
            subject_type="data_object",
        )
        if existing_domain is None and _props(obj).get("data_domain_id") is None:
            default_domain = await get_or_create_default_data_domain(
                db,
                workspace_id=ctx.workspace.id,
                org_id=ctx.org_id,
                user_id=ctx.user_id,
            )
            domain_to_assign = default_domain.id
    if domain_to_assign is not None:
        await _assign_entity_data_domain(db, ctx, obj, domain_to_assign)
        props = _props(obj)
    obj.properties = props
    await db.flush()
    return await get_entity(entity_id, ctx, db)


@router.post("/entities/{entity_id}/links", status_code=status.HTTP_204_NO_CONTENT)
async def add_entity_link(
    entity_id: UUID,
    body: DataLinkCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    await _get_object(db, ctx, entity_id, "data_object")
    assert ctx.workspace
    try:
        await validate_link_entity(db, ctx.workspace.id, ctx.org_id, body.entity_kind, body.entity_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await add_data_link(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_entity",
        entity_id,
        body.entity_kind,
        body.entity_id,
        body.link_kind,
        body.role_tag,
    )


# ─── Data Stores ─────────────────────────────────────────────────────────────


@router.post("/stores", response_model=DataStoreDetail, status_code=status.HTTP_201_CREATED)
async def create_store(
    body: DataStoreCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataStoreDetail:
    await ctx.require_write(db)
    assert ctx.workspace

    obj = MinEAObject(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        type="data_store",
        name=body.name.strip(),
        description=body.description,
        properties={
            "store_type": body.store_type or "relational_db",
            "technology": body.technology,
            "health": body.health or "healthy",
        },
        created_by=ctx.user_id,
    )
    db.add(obj)
    await db.flush()
    return await get_store(obj.id, ctx, db)


@router.get("/stores/{store_id}", response_model=DataStoreDetail)
async def get_store(
    store_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataStoreDetail:
    await ctx.require_read(db)
    assert ctx.workspace

    obj = await _get_object(db, ctx, store_id, "data_store")
    props = _props(obj)
    domain_id = props.get("data_domain_id")
    domain_uuid = UUID(str(domain_id)) if domain_id else None

    links = await load_data_links(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_store",
        obj.id,
        ["governed_by", "stores", "hosts", "source_target"],
    )

    return DataStoreDetail(
        id=obj.id,
        workspace_id=obj.workspace_id,
        org_id=obj.org_id,
        name=obj.name,
        description=obj.description,
        store_type=props.get("store_type"),
        technology=props.get("technology"),
        health=props.get("health"),
        data_domain_id=domain_uuid,
        data_domain_name=await get_domain_name(db, ctx.workspace.id, ctx.org_id, domain_uuid),
        links=links,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


@router.put("/stores/{store_id}", response_model=DataStoreDetail)
async def update_store(
    store_id: UUID,
    body: DataStoreUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataStoreDetail:
    await ctx.require_write(db)
    obj = await _get_object(db, ctx, store_id, "data_store")
    props = _props(obj)

    if body.name is not None:
        obj.name = body.name.strip()
    if body.description is not None:
        obj.description = body.description
    if body.store_type is not None:
        props["store_type"] = body.store_type
    if body.technology is not None:
        props["technology"] = body.technology
    if body.health is not None:
        props["health"] = body.health
    if body.data_domain_id is not None:
        await add_store_domain_assignment(
            db,
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            store_id=obj.id,
            domain_id=body.data_domain_id,
            user_id=ctx.user_id,
        )
        props.setdefault("data_domain_id", str(body.data_domain_id))
        await add_data_link(
            db,
            ctx.workspace.id,
            ctx.org_id,
            "data_store",
            obj.id,
            "data_domain",
            body.data_domain_id,
            "governed_by",
        )
    obj.properties = props
    await db.flush()
    return await get_store(store_id, ctx, db)


@router.post("/stores/{store_id}/links", status_code=status.HTTP_204_NO_CONTENT)
async def add_store_link(
    store_id: UUID,
    body: DataLinkCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    await _get_object(db, ctx, store_id, "data_store")
    assert ctx.workspace
    try:
        await validate_link_entity(db, ctx.workspace.id, ctx.org_id, body.entity_kind, body.entity_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await add_data_link(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_store",
        store_id,
        body.entity_kind,
        body.entity_id,
        body.link_kind,
        body.role_tag,
    )


# ─── Data Domains ────────────────────────────────────────────────────────────


@router.post("/domains", response_model=DataDomainDetail, status_code=status.HTTP_201_CREATED)
async def create_domain(
    body: DataDomainCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataDomainDetail:
    await ctx.require_write(db)
    assert ctx.workspace

    obj = MinEAObject(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        type="data_domain",
        name=body.name.strip(),
        description=body.description,
        properties={
            "classification": body.classification,
            "owning_team": body.owning_team,
            "steward_name": body.steward_name,
            "steward_email": body.steward_email,
        },
        created_by=ctx.user_id,
    )
    db.add(obj)
    await db.flush()
    return await get_domain(obj.id, ctx, db)


@router.get("/domains/{domain_id}", response_model=DataDomainDetail)
async def get_domain(
    domain_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataDomainDetail:
    await ctx.require_read(db)
    assert ctx.workspace

    obj = await _get_object(db, ctx, domain_id, "data_domain")
    props = _props(obj)
    cap_domain_id = props.get("capability_domain_id")
    cap_domain_uuid = UUID(str(cap_domain_id)) if cap_domain_id else None
    cap_domain_name = None
    if cap_domain_uuid:
        cap_result = await db.execute(
            select(MinEAObject.name).where(
                MinEAObject.id == cap_domain_uuid,
                MinEAObject.workspace_id == ctx.workspace.id,
                MinEAObject.org_id == ctx.org_id,
            )
        )
        cap_domain_name = cap_result.scalar_one_or_none()

    links = await load_data_links(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_domain",
        obj.id,
        ["system_of_record"],
    )
    rollup = await load_domain_rollup(
        db,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        domain_id=obj.id,
    )

    return DataDomainDetail(
        id=obj.id,
        workspace_id=obj.workspace_id,
        org_id=obj.org_id,
        name=obj.name,
        description=obj.description,
        classification=props.get("classification"),
        owning_team=props.get("owning_team"),
        steward_name=props.get("steward_name"),
        steward_email=props.get("steward_email"),
        capability_domain_id=cap_domain_uuid,
        capability_domain_name=cap_domain_name,
        links=links,
        inferred_summary=await infer_domain_summary(db, ctx.workspace.id, ctx.org_id, obj.id),
        domain_rollup=rollup,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


@router.put("/domains/{domain_id}", response_model=DataDomainDetail)
async def update_domain(
    domain_id: UUID,
    body: DataDomainUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DataDomainDetail:
    await ctx.require_write(db)
    obj = await _get_object(db, ctx, domain_id, "data_domain")
    props = _props(obj)

    if body.name is not None:
        obj.name = body.name.strip()
    if body.description is not None:
        obj.description = body.description
    if body.classification is not None:
        props["classification"] = body.classification
    if body.owning_team is not None:
        props["owning_team"] = body.owning_team
    if body.steward_name is not None:
        props["steward_name"] = body.steward_name
    if body.steward_email is not None:
        props["steward_email"] = body.steward_email
    if body.capability_domain_id is not None:
        props["capability_domain_id"] = str(body.capability_domain_id)
    obj.properties = props
    await db.flush()
    return await get_domain(domain_id, ctx, db)


@router.post("/domains/{domain_id}/links", status_code=status.HTTP_204_NO_CONTENT)
async def add_domain_link(
    domain_id: UUID,
    body: DataLinkCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    await _get_object(db, ctx, domain_id, "data_domain")
    assert ctx.workspace
    try:
        await validate_link_entity(db, ctx.workspace.id, ctx.org_id, body.entity_kind, body.entity_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await add_data_link(
        db,
        ctx.workspace.id,
        ctx.org_id,
        "data_domain",
        domain_id,
        body.entity_kind,
        body.entity_id,
        body.link_kind,
        body.role_tag,
    )


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    link_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_write(db)
    assert ctx.workspace

    result = await db.execute(
        select(DataLink).where(
            DataLink.id == link_id,
            DataLink.workspace_id == ctx.workspace.id,
            DataLink.org_id == ctx.org_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    await db.delete(row)
