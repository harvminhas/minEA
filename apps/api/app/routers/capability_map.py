from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.capability_map import (
    AdoptTemplateRequest,
    AdoptTemplateResponse,
    AddDomainMappingSystemRequest,
    CapabilityMapCapability,
    CapabilityMapDomain,
    CapabilityMapRead,
    CapabilityMapStatus,
    CapabilityPickerSuggestions,
    CapabilityTemplateDetail,
    CapabilityTemplateSummary,
    AcceptMapRequest,
    AcceptMapResponse,
    CreateDomainMappingSystemRequest,
    DomainDetailRead,
    DomainHistoryEntry,
    DomainHistoryResponse,
    DomainProductsRead,
    LibraryDomainGroup,
    SuggestLinksResponse,
    SuggestMapRequest,
    SuggestMapResponse,
    UpsertDomainMappingRequest,
    StructureMoveResponse,
    StructureMoveRequest,
    StructureDeleteImpact,
)
from app.services.authorization import require_object_room
from app.models.objects import ChangeLog, MinEAObject
from app.services.capability_map import (
    add_domain_mapping_system,
    NO_DOMAIN_ID,
    NO_DOMAIN_NAME,
    adopt_template,
    capability_name_exists_in_domain,
    capability_picker_suggestions,
    create_domain_mapping_system,
    get_domain,
    library_domain_groups,
    enrich_map_capability_rollups,
    load_capability_map,
    load_domain_detail,
    load_domain_products,
    map_is_initialized,
    move_activity_to_capability,
    move_capability_to_domain,
    structure_delete_impact,
    structure_kind,
    template_detail_for_api,
    templates_for_api,
    upsert_domain_mapping,
    _parse_uuid,
)
from app.services.domain_history import domain_history_entries_for_api
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/capability-map",
    tags=["capability-map"],
)


def _cap_read(cap, domain_id: str, rollups: dict[str, dict]) -> CapabilityMapCapability:
    cid = str(cap.id)
    extra = rollups.get(cid, {})
    parent = (cap.properties or {}).get("parent_id")
    parent_id = str(parent) if parent and str(parent) != str(domain_id) else None
    return CapabilityMapCapability(
        id=cid,
        name=cap.name,
        domain_id=domain_id,
        parent_id=parent_id,
        order_index=cap.properties.get("order_index"),
        maturity=cap.properties.get("maturity"),
        investment=cap.properties.get("investment"),
        owner=extra.get("owner"),
        object_status=extra.get("object_status"),
        system_count=extra.get("system_count", 0),
        product_count=extra.get("product_count", 0),
        coverage_status=extra.get("coverage_status", "no_system"),
        children=[],
    )


def _map_to_read(
    domains, capabilities, rollups: dict[str, dict] | None = None
) -> CapabilityMapRead:
    rollups = rollups or {}
    caps_by_domain: dict[str, list[CapabilityMapCapability]] = {}
    known = {str(domain.id) for domain in domains}
    raw: list[tuple[str, CapabilityMapCapability]] = []
    for cap in capabilities:
        domain_id = str((cap.properties or {}).get("domain_id") or "")
        if domain_id not in known:
            # No (or a dangling) domain: shown on the map in a "No domain" card.
            domain_id = NO_DOMAIN_ID
        raw.append((domain_id, _cap_read(cap, domain_id, rollups)))
    by_id = {item.id: item for _, item in raw}
    for domain_id, item in raw:
        if item.parent_id and item.parent_id in by_id:
            by_id[item.parent_id].children.append(item)
        else:
            item.parent_id = None
            caps_by_domain.setdefault(domain_id, []).append(item)
    for item in by_id.values():
        item.children.sort(key=lambda c: (c.order_index if c.order_index is not None else 999, c.name))

    domain_reads: list[CapabilityMapDomain] = []
    for domain in domains:
        props = domain.properties or {}
        domain_reads.append(
            CapabilityMapDomain(
                id=str(domain.id),
                name=domain.name,
                icon=props.get("icon"),
                color=props.get("color"),
                order_index=props.get("order_index"),
                source_template_id=props.get("source_template_id"),
                capabilities=sorted(
                    caps_by_domain.get(str(domain.id), []),
                    key=lambda c: (c.order_index if c.order_index is not None else 999, c.name),
                ),
            )
        )

    if caps_by_domain.get(NO_DOMAIN_ID):
        domain_reads.append(
            CapabilityMapDomain(
                id=NO_DOMAIN_ID,
                name=NO_DOMAIN_NAME,
                icon=None,
                color=None,
                order_index=None,
                source_template_id=None,
                capabilities=sorted(caps_by_domain[NO_DOMAIN_ID], key=lambda c: c.name),
            )
        )

    return CapabilityMapRead(initialized=len(domains) > 0 or bool(capabilities), domains=domain_reads)


@router.get("/status", response_model=CapabilityMapStatus)
async def get_status(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> CapabilityMapStatus:
    await ctx.require_read(db)
    assert ctx.workspace

    domains, capabilities = await load_capability_map(db, ctx.workspace.id, ctx.org_id)
    initialized = len(domains) > 0
    return CapabilityMapStatus(
        initialized=initialized,
        domain_count=len(domains),
        capability_count=len(capabilities),
    )


@router.get("", response_model=CapabilityMapRead)
async def get_capability_map(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> CapabilityMapRead:
    await ctx.require_read(db)
    assert ctx.workspace

    domains, capabilities = await load_capability_map(db, ctx.workspace.id, ctx.org_id)
    rollups = await enrich_map_capability_rollups(
        db, ctx.workspace.id, ctx.org_id, domains, capabilities
    )
    return _map_to_read(domains, capabilities, rollups)


@router.get("/templates", response_model=list[CapabilityTemplateSummary])
async def list_capability_templates(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[CapabilityTemplateSummary]:
    await ctx.require_read(db)
    return [CapabilityTemplateSummary(**t) for t in templates_for_api()]


@router.get("/templates/{template_id}", response_model=CapabilityTemplateDetail)
async def get_capability_template(
    template_id: str,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> CapabilityTemplateDetail:
    await ctx.require_read(db)
    detail = template_detail_for_api(template_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return CapabilityTemplateDetail(**detail)


@router.get("/library/domains", response_model=list[LibraryDomainGroup])
async def list_library_domains(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[LibraryDomainGroup]:
    await ctx.require_read(db)
    assert ctx.workspace

    domains, _ = await load_capability_map(db, ctx.workspace.id, ctx.org_id)
    groups = library_domain_groups([d.name for d in domains])
    return [LibraryDomainGroup(**group) for group in groups]


@router.get("/library/capabilities", response_model=CapabilityPickerSuggestions)
async def list_library_capabilities(
    domain_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> CapabilityPickerSuggestions:
    await ctx.require_read(db)
    assert ctx.workspace

    domains, capabilities = await load_capability_map(db, ctx.workspace.id, ctx.org_id)
    domain = next((d for d in domains if d.id == domain_id), None)
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    existing_names = [
        cap.name
        for cap in capabilities
        if str(cap.properties.get("domain_id", "")) == str(domain_id)
    ]
    other_domain_caps: list[tuple[str, str]] = []
    domain_names = {str(d.id): d.name for d in domains}
    for cap in capabilities:
        cap_domain_id = str(cap.properties.get("domain_id", ""))
        if cap_domain_id == str(domain_id):
            continue
        from_domain = domain_names.get(cap_domain_id)
        if from_domain:
            other_domain_caps.append((cap.name, from_domain))

    suggestions = capability_picker_suggestions(domain.name, existing_names, other_domain_caps)
    return CapabilityPickerSuggestions(**suggestions)


@router.get("/domains/{domain_id}", response_model=DomainDetailRead)
async def get_domain_detail(
    domain_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DomainDetailRead:
    await ctx.require_read(db)
    assert ctx.workspace

    detail = await load_domain_detail(db, ctx.workspace.id, ctx.org_id, domain_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    return DomainDetailRead(**detail)


@router.get("/domains/{domain_id}/history", response_model=DomainHistoryResponse)
async def get_domain_history(
    domain_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DomainHistoryResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    domain = await get_domain(db, ctx.workspace.id, ctx.org_id, domain_id)
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    rows = await domain_history_entries_for_api(
        db, ctx.workspace.id, ctx.org_id, domain_id
    )
    return DomainHistoryResponse(
        entries=[DomainHistoryEntry(**row) for row in rows]
    )


@router.get("/domains/{domain_id}/products", response_model=DomainProductsRead)
async def get_domain_products(
    domain_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DomainProductsRead:
    await ctx.require_read(db)
    assert ctx.workspace

    domain = await get_domain(db, ctx.workspace.id, ctx.org_id, domain_id)
    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    items = await load_domain_products(db, ctx.workspace.id, ctx.org_id, domain_id)
    return DomainProductsRead(items=items)


@router.post("/domains/{domain_id}/mapping-systems", status_code=status.HTTP_204_NO_CONTENT)
async def add_domain_mapping_system_endpoint(
    domain_id: UUID,
    body: AddDomainMappingSystemRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    try:
        await add_domain_mapping_system(
            db,
            ctx.workspace.id,
            ctx.org_id,
            domain_id,
            UUID(body.system_id),
            ctx.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()


@router.post("/domains/{domain_id}/mapping-systems/create", response_model=DomainDetailRead)
async def create_domain_mapping_system_endpoint(
    domain_id: UUID,
    body: CreateDomainMappingSystemRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> DomainDetailRead:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace
    # Creates an application (the mapping system), which counts towards the plan's apps & AI agents.
    await require_object_room(db, ctx.org_id, ctx.workspace.id)

    try:
        await create_domain_mapping_system(
            db,
            ctx.workspace.id,
            ctx.org_id,
            ctx.user_id,
            domain_id,
            body.name,
            body.category,
            body.vendor,
            body.hosting_model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    detail = await load_domain_detail(db, ctx.workspace.id, ctx.org_id, domain_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    return DomainDetailRead(**detail)


@router.put("/domains/{domain_id}/mappings", status_code=status.HTTP_204_NO_CONTENT)
async def upsert_domain_mapping_endpoint(
    domain_id: UUID,
    body: UpsertDomainMappingRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    try:
        await upsert_domain_mapping(
            db,
            ctx.workspace.id,
            ctx.org_id,
            ctx.user_id,
            domain_id,
            UUID(body.capability_id),
            UUID(body.system_id),
            body.fitness,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.commit()


@router.post("/adopt", response_model=AdoptTemplateResponse, status_code=status.HTTP_201_CREATED)
async def adopt_capability_template(
    body: AdoptTemplateRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> AdoptTemplateResponse:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace

    try:
        domains, capabilities = await adopt_template(
            db,
            ctx.workspace.id,
            ctx.org_id,
            ctx.user_id,
            body.template_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    return AdoptTemplateResponse(
        template_id=body.template_id,
        domain_count=len(domains),
        capability_count=len(capabilities),
    )


@router.post("/suggest", response_model=SuggestMapResponse)
async def suggest_capability_map(
    body: SuggestMapRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SuggestMapResponse:
    """Propose a map (or L3 activities under the existing one). Does not write anything."""
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace
    from app.services.capability_suggest import suggest_map

    result = await suggest_map(
        db,
        ctx.workspace.id,
        ctx.org_id,
        about=body.about,
        industry=body.industry,
        size=body.size,
        services=body.services,
        website=body.website,
    )
    return SuggestMapResponse(**result)


@router.post("/accept", response_model=AcceptMapResponse)
async def accept_capability_map(
    body: AcceptMapRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> AcceptMapResponse:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace
    from app.services.capability_suggest import accept_map

    result = await accept_map(
        db,
        ctx.workspace.id,
        ctx.org_id,
        ctx.user_id,
        [d.model_dump() for d in body.domains],
    )
    await db.commit()
    return AcceptMapResponse(**result)


@router.post("/suggest-links", response_model=SuggestLinksResponse)
async def suggest_capability_links(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SuggestLinksResponse:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace
    from app.services.capability_suggest import suggest_links

    result = await suggest_links(db, ctx.workspace.id, ctx.org_id)
    return SuggestLinksResponse(**result)


async def _structure_object(db: AsyncSession, ctx: TenancyContext, object_id: UUID) -> MinEAObject:
    assert ctx.workspace
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj or structure_kind(obj) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    return obj


@router.get("/nodes/{object_id}/delete-impact", response_model=StructureDeleteImpact)
async def get_structure_delete_impact(
    object_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> StructureDeleteImpact:
    await ctx.require_permission(db, "object.delete")
    assert ctx.workspace
    obj = await _structure_object(db, ctx, object_id)
    try:
        payload = await structure_delete_impact(db, ctx.workspace.id, ctx.org_id, obj)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return StructureDeleteImpact(**payload)


def _move_response(obj: MinEAObject, created_domain_id=None, created_capability_id=None) -> StructureMoveResponse:
    kind = structure_kind(obj) or "capability"
    props = obj.properties or {}
    domain = props.get("domain_id")
    parent = props.get("parent_id")
    return StructureMoveResponse(
        id=str(obj.id),
        kind=kind,
        name=obj.name,
        domain_id=str(domain) if domain else None,
        parent_id=str(parent) if parent and str(parent) != str(domain or "") else None,
        created_domain_id=str(created_domain_id) if created_domain_id else None,
        created_capability_id=str(created_capability_id) if created_capability_id else None,
    )


@router.post("/nodes/{object_id}/move", response_model=StructureMoveResponse)
async def move_structure_node(
    object_id: UUID,
    body: StructureMoveRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> StructureMoveResponse:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace
    obj = await _structure_object(db, ctx, object_id)
    kind = structure_kind(obj)
    created_domain_id = None
    created_capability_id = None

    try:
        if kind == "domain":
            raise ValueError("A domain cannot be moved under another domain")

        if kind == "capability":
            domain_id = _parse_uuid(body.domain_id)
            new_name = (body.new_domain_name or "").strip()
            if new_name:
                await ctx.require_permission(db, "object.create")
                domain = MinEAObject(
                    workspace_id=ctx.workspace.id,
                    org_id=ctx.org_id,
                    type="business_domain",
                    name=new_name,
                    status="active",
                    properties={},
                    created_by=ctx.user_id,
                    updated_by=ctx.user_id,
                )
                db.add(domain)
                await db.flush()
                db.add(ChangeLog(
                    workspace_id=ctx.workspace.id,
                    org_id=ctx.org_id,
                    object_id=domain.id,
                    object_type=domain.type,
                    action="created",
                    diff={"action_type": "created_object", "name": domain.name, "type": domain.type},
                    performed_by=ctx.user_id,
                ))
                created_domain_id = domain.id
                domain_id = domain.id
            if not domain_id:
                raise ValueError("Choose a domain, or create a new one")
            await move_capability_to_domain(db, ctx.workspace.id, ctx.org_id, obj, domain_id)

        elif kind == "activity":
            parent_id = _parse_uuid(body.parent_id)
            new_name = (body.new_capability_name or "").strip()
            if new_name:
                await ctx.require_permission(db, "object.create")
                domain_id = _parse_uuid(body.domain_id) or _parse_uuid((obj.properties or {}).get("domain_id"))
                if domain_id and await capability_name_exists_in_domain(
                    db, ctx.workspace.id, ctx.org_id, domain_id, new_name
                ):
                    raise ValueError(f"A capability named {new_name!r} already exists in that domain")
                props: dict = {}
                if domain_id:
                    props["domain_id"] = str(domain_id)
                parent = MinEAObject(
                    workspace_id=ctx.workspace.id,
                    org_id=ctx.org_id,
                    type="capability",
                    name=new_name,
                    status="active",
                    properties=props,
                    created_by=ctx.user_id,
                    updated_by=ctx.user_id,
                )
                db.add(parent)
                await db.flush()
                db.add(ChangeLog(
                    workspace_id=ctx.workspace.id,
                    org_id=ctx.org_id,
                    object_id=parent.id,
                    object_type=parent.type,
                    action="created",
                    diff={"action_type": "created_object", "name": parent.name, "type": parent.type},
                    performed_by=ctx.user_id,
                ))
                created_capability_id = parent.id
                parent_id = parent.id
            if not parent_id:
                raise ValueError("Choose a capability, or create a new one")
            await move_activity_to_capability(db, ctx.workspace.id, ctx.org_id, obj, parent_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=obj.id,
        object_type=obj.type,
        action="updated",
        diff={"action_type": "moved_structure_node", "name": obj.name, "kind": kind},
        performed_by=ctx.user_id,
    ))
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
    await db.refresh(obj)
    return _move_response(obj, created_domain_id, created_capability_id)
