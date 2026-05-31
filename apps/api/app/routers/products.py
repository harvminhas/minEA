from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.views_graph import Product, ProductCapability
from app.schemas.products import (
    ProductCreate,
    ProductGraphResponse,
    ProductListResponse,
    ProductRead,
    ProductUpdate,
)
from app.services.portfolio_signals import enrich_portfolio_signals
from app.services.product_detail import enrich_product_detail
from app.services.product_graph import build_product_graph, load_product_for_graph
from app.services.product_stats import enrich_product, validate_capability_ids, _capability_ids
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/products",
    tags=["products"],
)


async def _to_read(db: AsyncSession, product: Product, *, include_detail: bool = False) -> ProductRead:
    await db.refresh(product)
    # Snapshot ORM columns before any further await — expired instances trigger async lazy-load errors.
    product_fields = {
        "id": product.id,
        "workspace_id": product.workspace_id,
        "org_id": product.org_id,
        "name": product.name,
        "product_line": product.product_line,
        "lifecycle": product.lifecycle,
        "owner": product.owner,
        "description": product.description,
        "graph_layout": product.graph_layout,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }

    stats = await enrich_product(db, product)
    cap_ids = await _capability_ids(db, product_fields["id"])
    portfolio = await enrich_portfolio_signals(
        db,
        product,
        capability_count=stats["capability_count"],
        maturity_indicator=stats.get("maturity_indicator"),
    )
    detail: dict = {}
    if include_detail:
        detail = await enrich_product_detail(
            db,
            product,
            open_debt=portfolio["open_tech_debt_count"],
            critical_debt=portfolio["critical_tech_debt_count"],
            maturity_indicator=stats.get("maturity_indicator"),
            system_count=stats["system_count"],
        )
    return ProductRead(
        capability_ids=cap_ids,
        **product_fields,
        **stats,
        **portfolio,
        **detail,
    )


@router.get("", response_model=ProductListResponse)
async def list_products(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProductListResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(Product.workspace_id == ctx.workspace.id, Product.org_id == ctx.org_id)
        .order_by(Product.product_line.nulls_last(), Product.name)
    )
    products = result.scalars().all()
    items = [await _to_read(db, p) for p in products]
    return ProductListResponse(items=items, total=len(items))


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace

    try:
        await validate_capability_ids(db, ctx.workspace.id, ctx.org_id, body.capability_ids)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    product = Product(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        name=body.name,
        product_line=body.product_line,
        lifecycle=body.lifecycle,
        owner=body.owner,
        description=body.description,
        created_by=ctx.user_id,
    )
    db.add(product)
    await db.flush()

    for cap_id in body.capability_ids:
        db.add(ProductCapability(product_id=product.id, capability_id=cap_id))

    await db.flush()
    await db.refresh(product, ["capabilities"])
    return await _to_read(db, product)


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
            Product.org_id == ctx.org_id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return await _to_read(db, product, include_detail=True)


@router.get("/{product_id}/graph", response_model=ProductGraphResponse)
async def get_product_graph(
    product_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProductGraphResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    product = await load_product_for_graph(db, product_id, ctx.workspace.id, ctx.org_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    graph = await build_product_graph(db, product)
    return ProductGraphResponse(**graph, graph_layout=product.graph_layout)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: UUID,
    body: ProductUpdate,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    await ctx.require_permission(db, "object.edit")
    assert ctx.workspace

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
            Product.org_id == ctx.org_id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if body.capability_ids is not None:
        try:
            await validate_capability_ids(db, ctx.workspace.id, ctx.org_id, body.capability_ids)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        await db.execute(
            delete(ProductCapability).where(ProductCapability.product_id == product.id)
        )
        await db.flush()
        for cap_id in body.capability_ids:
            db.add(ProductCapability(product_id=product.id, capability_id=cap_id))

    for field in ("name", "product_line", "lifecycle", "owner", "description", "graph_layout"):
        if field in body.model_fields_set:
            setattr(product, field, getattr(body, field))

    await db.flush()
    return await _to_read(db, product)
