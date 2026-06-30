from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.objects import ChangeLog, MinEAObject
from app.models.tenancy import User
from app.models.views_graph import Product, ProductCapability
from app.schemas.products import (
    ProductCreate,
    ProductGraphResponse,
    ProductHistoryEntry,
    ProductHistoryResponse,
    ProductListResponse,
    ProductRead,
    ProductUpdate,
)
from app.services.owner_fields import apply_ownership_write_resolved, ownership_from_body, ownership_read_payload
from app.services.portfolio_signals import enrich_portfolio_signals
from app.services.product_detail import compute_health_dimensions, enrich_product_detail
from app.services.product_graph import build_product_graph, load_product_for_graph
from app.services.product_stats import enrich_product, validate_capability_ids
from app.services.product_stats import capability_ids_for_product as _capability_ids
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/products",
    tags=["products"],
)


def _first_name(user: User | None) -> str | None:
    if user is None:
        return None
    if user.full_name:
        return user.full_name.split()[0]
    return user.email.split("@")[0]


def _describe_history(entry: ChangeLog) -> tuple[str, str | None]:
    """Return (action_summary, detail) from a changelog entry."""
    diff = entry.diff or {}
    action_type = diff.get("action_type", entry.action)

    if action_type == "created_product":
        return "created this product", None

    if action_type == "updated_capabilities":
        added: list[dict] = diff.get("added", [])
        removed: list[dict] = diff.get("removed", [])
        if added and not removed:
            n = len(added)
            names = ", ".join(a["name"] for a in added[:6])
            label = "capability" if n == 1 else f"{n} capabilities"
            return f"added {label}", names
        if removed and not added:
            n = len(removed)
            names = ", ".join(r["name"] for r in removed[:6])
            label = "capability" if n == 1 else f"{n} capabilities"
            return f"removed {label}", names
        return "updated capabilities", None

    if action_type == "updated_fields":
        changes: dict = diff.get("changes", {})
        if list(changes.keys()) == ["lifecycle"]:
            old = changes["lifecycle"].get("old", "?")
            new = changes["lifecycle"].get("new", "?")
            return "updated status", f"{old} → {new}"
        if list(changes.keys()) == ["owner"]:
            old = changes["owner"].get("old") or "Unassigned"
            new = changes["owner"].get("new") or "Unassigned"
            return "updated owner", f"{old} → {new}"
        if list(changes.keys()) == ["name"]:
            return "renamed product", changes["name"].get("new")
        labels = ", ".join(k.replace("_", " ") for k in changes)
        return f"updated {labels}", None

    return entry.action.replace("_", " "), None


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
        **ownership_read_payload(product),
        "description": product.description,
        "graph_layout": product.graph_layout,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }

    updated_by_id = product.updated_by
    if updated_by_id is not None:
        user_result = await db.execute(select(User).where(User.id == updated_by_id))
        product_fields["updated_by_name"] = _first_name(user_result.scalar_one_or_none())
    else:
        product_fields["updated_by_name"] = None

    stats = await enrich_product(db, product)
    cap_ids = await _capability_ids(db, product_fields["id"])
    portfolio = await enrich_portfolio_signals(
        db,
        product,
        capability_count=stats["capability_count"],
        maturity_indicator=stats.get("maturity_indicator"),
    )
    health_dimensions = compute_health_dimensions(
        lifecycle=product_fields["lifecycle"],
        owner=product_fields["owner"],
        open_debt=portfolio["open_tech_debt_count"],
        critical_debt=portfolio["critical_tech_debt_count"],
        maturity_indicator=stats.get("maturity_indicator"),
        system_count=stats["system_count"],
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
        detail.pop("health_dimensions", None)
    return ProductRead(
        capability_ids=cap_ids,
        health_dimensions=health_dimensions,
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
        owner=None,
        description=body.description,
        created_by=ctx.user_id,
        updated_by=ctx.user_id,
    )
    db.add(product)
    await db.flush()
    await apply_ownership_write_resolved(
        db,
        product,
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        **ownership_from_body(body),
    )

    for cap_id in body.capability_ids:
        db.add(ProductCapability(product_id=product.id, capability_id=cap_id))

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=product.id,
        object_type="product",
        action="created",
        diff={"action_type": "created_product", "name": product.name},
        performed_by=ctx.user_id,
    ))

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

        old_cap_ids = {str(cap.capability_id) for cap in product.capabilities}
        new_cap_ids = {str(cid) for cid in body.capability_ids}
        added_ids = new_cap_ids - old_cap_ids
        removed_ids = old_cap_ids - new_cap_ids

        if added_ids or removed_ids:
            # Look up capability names for readable history
            all_ids = [UUID(i) for i in (added_ids | removed_ids)]
            cap_result = await db.execute(
                select(MinEAObject.id, MinEAObject.name).where(MinEAObject.id.in_(all_ids))
            )
            cap_name_map = {str(row[0]): row[1] for row in cap_result.all()}

            db.add(ChangeLog(
                workspace_id=ctx.workspace.id,
                org_id=ctx.org_id,
                object_id=product.id,
                object_type="product",
                action="updated",
                diff={
                    "action_type": "updated_capabilities",
                    "added": [{"id": i, "name": cap_name_map.get(i, i)} for i in sorted(added_ids)],
                    "removed": [{"id": i, "name": cap_name_map.get(i, i)} for i in sorted(removed_ids)],
                },
                performed_by=ctx.user_id,
            ))

        await db.execute(
            delete(ProductCapability).where(ProductCapability.product_id == product.id)
        )
        await db.flush()
        for cap_id in body.capability_ids:
            db.add(ProductCapability(product_id=product.id, capability_id=cap_id))

    field_changes: dict = {}
    updates = body.model_dump(exclude_unset=True)
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
        old_owner = product.owner
        await apply_ownership_write_resolved(
            db,
            product,
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            user_id=ctx.user_id,
            **ownership_updates,
        )
        if product.owner != old_owner:
            field_changes["owner"] = {"old": old_owner, "new": product.owner}

    for field in ("name", "product_line", "lifecycle", "description", "graph_layout"):
        if field not in updates:
            continue
        old_val = getattr(product, field)
        new_val = updates[field]
        if old_val != new_val and field != "graph_layout":
            field_changes[field] = {"old": old_val, "new": new_val}
        setattr(product, field, new_val)

    if field_changes:
        db.add(ChangeLog(
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            object_id=product.id,
            object_type="product",
            action="updated",
            diff={"action_type": "updated_fields", "changes": field_changes},
            performed_by=ctx.user_id,
        ))

    product.updated_by = ctx.user_id

    await db.flush()
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    return await _to_read(db, product)


@router.get("/{product_id}/history", response_model=ProductHistoryResponse)
async def get_product_history(
    product_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> ProductHistoryResponse:
    await ctx.require_read(db)
    assert ctx.workspace

    entries_result = await db.execute(
        select(ChangeLog)
        .where(
            ChangeLog.workspace_id == ctx.workspace.id,
            ChangeLog.object_id == product_id,
            ChangeLog.object_type == "product",
        )
        .order_by(ChangeLog.created_at.desc())
        .limit(50)
    )
    entries = entries_result.scalars().all()

    # Batch-load actor names
    actor_ids = list({e.performed_by for e in entries if e.performed_by})
    users_result = await db.execute(select(User).where(User.id.in_(actor_ids)))
    user_map: dict[str, User] = {str(u.id): u for u in users_result.scalars().all()}

    history: list[ProductHistoryEntry] = []
    for entry in entries:
        actor_user = user_map.get(str(entry.performed_by)) if entry.performed_by else None
        actor_name = _first_name(actor_user) or "Someone"
        action, detail = _describe_history(entry)
        history.append(ProductHistoryEntry(
            id=str(entry.id),
            actor_name=actor_name,
            action=action,
            detail=detail,
            created_at=entry.created_at,
        ))

    return ProductHistoryResponse(entries=history)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ctx.require_permission(db, "object.delete")
    assert ctx.workspace

    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.workspace_id == ctx.workspace.id,
            Product.org_id == ctx.org_id,
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    db.add(ChangeLog(
        workspace_id=ctx.workspace.id,
        org_id=ctx.org_id,
        object_id=product.id,
        object_type="product",
        action="deleted",
        diff={"action_type": "deleted_product", "name": product.name},
        performed_by=ctx.user_id,
    ))

    await db.delete(product)
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)
    await db.commit()
