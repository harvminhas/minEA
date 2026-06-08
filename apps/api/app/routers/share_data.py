"""Read-only data endpoints for public share links."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.objects import MinEAObject, Workspace
from app.models.relationships import Relationship
from app.models.views_graph import Product
from app.routers.capability_map import _map_to_read
from app.schemas.capability_map import DomainDetailRead
from app.routers.objects import _to_read as object_to_read
from app.routers.products import _to_read as product_to_read
from app.schemas.objects import ObjectListResponse
from app.schemas.products import ProductListResponse
from app.schemas.relationships import RelationshipRead
from app.services.capability_heatmap import build_capability_heatmap
from app.services.capability_map import (
    enrich_map_capability_rollups,
    load_capability_map,
    load_domain_detail,
)
from app.services.share_access import ShareContext, assert_share_data_path, resolve_share
from app.services.workspace_snapshot_store import get_workspace_snapshot_response

router = APIRouter(prefix="/shares", tags=["shares"])


async def _share_ctx(token: str, path: str, db: AsyncSession) -> ShareContext:
    ctx = await resolve_share(db, token)
    assert_share_data_path(ctx, path)
    return ctx


@router.get("/{token}")
async def preview_share(token: str, db: AsyncSession = Depends(get_db)):
    from app.models.shares import ShareLink
    from app.models.tenancy import Org, User
    from app.schemas.shares import SharePreview
    from app.services.authorization import hash_token
    from app.services.share_access import share_is_expired

    token_hash = hash_token(token)
    result = await db.execute(
        select(ShareLink, Org, Workspace, User)
        .join(Org, Org.id == ShareLink.org_id)
        .join(Workspace, Workspace.id == ShareLink.workspace_id)
        .outerjoin(User, User.id == ShareLink.created_by)
        .where(ShareLink.token_hash == token_hash)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    link, org, workspace, creator = row
    expired = share_is_expired(link)
    revoked = link.status == "revoked"
    shared_by_name = None
    if creator:
        shared_by_name = creator.full_name or creator.email.split("@")[0]

    return SharePreview(
        org_name=org.name,
        org_slug=org.slug,
        workspace_name=workspace.name,
        workspace_slug=workspace.slug,
        resource_type=link.resource_type,
        resource_key=link.resource_key,
        resource_id=link.resource_id,
        title=link.title,
        status=link.status,
        expired=expired,
        revoked=revoked,
        shared_by_name=shared_by_name,
        expires_at=link.expires_at,
    )


@router.get("/{token}/data/workspace/summary")
async def share_workspace_summary(token: str, db: AsyncSession = Depends(get_db)):
    ctx = await _share_ctx(token, "workspace/summary", db)
    return await get_workspace_snapshot_response(db, ctx.workspace.id, ctx.org.id)


@router.get("/{token}/data/products", response_model=ProductListResponse)
async def share_list_products(token: str, db: AsyncSession = Depends(get_db)):
    ctx = await _share_ctx(token, "products", db)
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(Product.workspace_id == ctx.workspace.id, Product.org_id == ctx.org.id)
        .order_by(Product.product_line.nulls_last(), Product.name)
    )
    products = result.scalars().all()
    items = [await product_to_read(db, p) for p in products]
    return ProductListResponse(items=items, total=len(items))


@router.get("/{token}/data/products/{product_id}")
async def share_get_product(token: str, product_id: UUID, db: AsyncSession = Depends(get_db)):
    path = f"products/{product_id}"
    ctx = await _share_ctx(token, path, db)
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
            Product.org_id == ctx.org.id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return await product_to_read(db, product, include_detail=True)


@router.get("/{token}/data/objects", response_model=ObjectListResponse)
async def share_list_objects(
    token: str,
    type: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    ctx = await _share_ctx(token, "objects", db)
    from app.routers import objects as objects_router

    q = select(MinEAObject).where(
        MinEAObject.workspace_id == ctx.workspace.id,
        MinEAObject.org_id == ctx.org.id,
    )
    if type:
        q = q.where(MinEAObject.type == type)
    if status:
        q = q.where(MinEAObject.status == status)
    if search:
        q = q.where(MinEAObject.name.ilike(f"%{search}%"))

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()
    order_col = MinEAObject.created_at if type == "tech_debt" else MinEAObject.updated_at
    q = q.order_by(order_col.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = list(result.scalars().all())

    reads = [await object_to_read(db, obj) for obj in items]
    return ObjectListResponse(items=reads, total=total, page=page, page_size=page_size)


@router.get("/{token}/data/objects/{object_id}")
async def share_get_object(token: str, object_id: UUID, db: AsyncSession = Depends(get_db)):
    path = f"objects/{object_id}"
    ctx = await _share_ctx(token, path, db)
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == object_id,
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.org_id == ctx.org.id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    return await object_to_read(db, obj)


@router.get("/{token}/data/relationships", response_model=list[RelationshipRead])
async def share_list_relationships(
    token: str,
    from_object_id: UUID | None = Query(None),
    to_object_id: UUID | None = Query(None),
    type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    ctx = await _share_ctx(token, "relationships", db)
    q = select(Relationship).where(
        Relationship.workspace_id == ctx.workspace.id,
        Relationship.org_id == ctx.org.id,
    )
    if from_object_id:
        q = q.where(Relationship.from_object_id == from_object_id)
    if to_object_id:
        q = q.where(Relationship.to_object_id == to_object_id)
    if type:
        q = q.where(Relationship.type == type)
    result = await db.execute(q.order_by(Relationship.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{token}/data/capability-map")
async def share_capability_map(token: str, db: AsyncSession = Depends(get_db)):
    ctx = await _share_ctx(token, "capability-map", db)
    domains, capabilities = await load_capability_map(db, ctx.workspace.id, ctx.org.id)
    rollups = await enrich_map_capability_rollups(
        db, ctx.workspace.id, ctx.org.id, domains, capabilities
    )
    return _map_to_read(domains, capabilities, rollups)


@router.get("/{token}/data/capability-map/heatmap")
async def share_capability_heatmap(token: str, db: AsyncSession = Depends(get_db)):
    ctx = await _share_ctx(token, "capability-map/heatmap", db)
    from app.schemas.capability_map import CapabilityHeatmapRead

    data = await build_capability_heatmap(db, ctx.workspace.id, ctx.org.id)
    return CapabilityHeatmapRead(**data)


@router.get("/{token}/data/capability-map/domains/{domain_id}")
async def share_capability_domain(token: str, domain_id: UUID, db: AsyncSession = Depends(get_db)):
    path = f"capability-map/domains/{domain_id}"
    ctx = await _share_ctx(token, path, db)
    detail = await load_domain_detail(db, ctx.workspace.id, ctx.org.id, domain_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    return DomainDetailRead(**detail)


@router.get("/{token}/data/journeys")
async def share_list_journeys(token: str, db: AsyncSession = Depends(get_db)):
    ctx = await _share_ctx(token, "journeys", db)
    from app.models.views_graph import CustomerJourney, JourneyMoment
    from app.routers.journeys import _to_read as journey_to_read
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(CustomerJourney)
        .options(
            selectinload(CustomerJourney.steps).selectinload(JourneyMoment.processes),
            selectinload(CustomerJourney.steps).selectinload(JourneyMoment.systems),
        )
        .where(CustomerJourney.workspace_id == ctx.workspace.id, CustomerJourney.org_id == ctx.org.id)
        .order_by(CustomerJourney.name)
    )
    journeys = result.scalars().unique().all()
    items = [await journey_to_read(j) for j in journeys]
    from app.schemas.journeys import JourneyListResponse

    return JourneyListResponse(items=items, total=len(items))


@router.api_route("/{token}/data/{path:path}", methods=["GET"])
async def share_data_fallback(token: str, path: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Catch-all for nested read paths (e.g. capability-map/domains/{id}/products)."""
    ctx = await resolve_share(db, token)
    assert_share_data_path(ctx, path)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Share data endpoint not implemented: {path}",
    )
