from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
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
    CreateDomainMappingSystemRequest,
    DomainDetailRead,
    LibraryDomainGroup,
    UpsertDomainMappingRequest,
)
from app.services.capability_map import (
    add_domain_mapping_system,
    adopt_template,
    capability_picker_suggestions,
    create_domain_mapping_system,
    library_domain_groups,
    load_capability_map,
    load_domain_detail,
    map_is_initialized,
    template_detail_for_api,
    templates_for_api,
    upsert_domain_mapping,
)
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/capability-map",
    tags=["capability-map"],
)


def _map_to_read(domains, capabilities) -> CapabilityMapRead:
    caps_by_domain: dict[str, list[CapabilityMapCapability]] = {}
    for cap in capabilities:
        domain_id = str(cap.properties.get("domain_id", ""))
        if not domain_id:
            continue
        caps_by_domain.setdefault(domain_id, []).append(
            CapabilityMapCapability(
                id=str(cap.id),
                name=cap.name,
                domain_id=domain_id,
                order_index=cap.properties.get("order_index"),
                maturity=cap.properties.get("maturity"),
                investment=cap.properties.get("investment"),
            )
        )

    domain_reads: list[CapabilityMapDomain] = []
    for domain in domains:
        props = domain.properties or {}
        domain_reads.append(
            CapabilityMapDomain(
                id=str(domain.id),
                name=domain.name,
                icon=props.get("icon"),
                order_index=props.get("order_index"),
                source_template_id=props.get("source_template_id"),
                capabilities=sorted(
                    caps_by_domain.get(str(domain.id), []),
                    key=lambda c: (c.order_index if c.order_index is not None else 999, c.name),
                ),
            )
        )

    return CapabilityMapRead(initialized=len(domains) > 0, domains=domain_reads)


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
    return _map_to_read(domains, capabilities)


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
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

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

    await db.commit()
    return AdoptTemplateResponse(
        template_id=body.template_id,
        domain_count=len(domains),
        capability_count=len(capabilities),
    )
