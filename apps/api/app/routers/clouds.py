"""Clouds & tenants.

- /orgs/{org}/workspaces/{ws}/cloud-regions: custom regions for the pickers (read: members;
  add: editors). Built-in providers/regions ship in the web bundle (cloud-regions.json).
- /orgs/{org}/clouds?workspace=: Org settings > Clouds & tenants (org admins), scoped to one
  workspace like People & teams: tenants by provider (rename, merge, delete with usage, tenant ID,
  owner, cost, regions used) and custom regions (rename, merge, delete with usage).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.services import cloud_regions as cr
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_org_context, get_workspace_context

regions_router = APIRouter(prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/cloud-regions", tags=["clouds"])
router = APIRouter(prefix="/orgs/{org_slug}/clouds", tags=["clouds"])


class RegionCreate(BaseModel):
    provider: str
    name: str = Field(min_length=1, max_length=200)


class RegionRename(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class TenantMerge(BaseModel):
    into_id: str
    from_ids: list[str] = Field(min_length=1, max_length=50)


class RegionMerge(BaseModel):
    into_key: str
    from_ids: list[str] = Field(min_length=1, max_length=50)


@regions_router.get("")
async def read_regions(ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)) -> dict:
    await ctx.require_read(db)
    assert ctx.workspace
    return {"custom": await cr.list_custom(db, ctx.workspace.id), "available": await cr.table_available(db)}


@regions_router.post("", status_code=201)
async def add_region(body: RegionCreate, ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)) -> dict:
    await ctx.require_write(db)
    assert ctx.workspace
    try:
        return await cr.create_custom(db, ctx.workspace.id, ctx.org_id, ctx.user_id, body.provider, body.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


async def _admin_workspace(ctx: TenancyContext, db: AsyncSession, workspace: str) -> Workspace:
    await ctx.require_org_admin(db)
    ws = (await db.execute(select(Workspace).where(Workspace.org_id == ctx.org_id, Workspace.slug == workspace))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.get("")
async def read_clouds(workspace: str, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    tenants = await cr.list_tenants(db, ws.id)
    return {"tenants": tenants, "custom": await cr.list_custom(db, ws.id), "available": await cr.table_available(db),
            "duplicates": cr.duplicate_tenants(tenants)}


@router.patch("/tenants/{tenant_id}")
async def edit_tenant(tenant_id: str, workspace: str, body: dict, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await notify_workspace_data_changed(db, ws.id, ctx.org_id)
        await cr.update_tenant(db, ws.id, tenant_id, body)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return {"ok": True}


@router.post("/tenants/merge")
async def merge_tenants(workspace: str, body: TenantMerge, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await notify_workspace_data_changed(db, ws.id, ctx.org_id)
        merged = await cr.merge_tenants(db, ws.id, ctx.org_id, ctx.user_id, body.into_id, body.from_ids)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return {"merged": merged}


@router.delete("/tenants/{tenant_id}", status_code=204)
async def remove_tenant(tenant_id: str, workspace: str, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> Response:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await notify_workspace_data_changed(db, ws.id, ctx.org_id)
        await cr.delete_tenant(db, ws.id, ctx.org_id, ctx.user_id, tenant_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/regions/{region_id}")
async def rename_region(region_id: str, workspace: str, body: RegionRename, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await notify_workspace_data_changed(db, ws.id, ctx.org_id)
        await cr.rename_custom(db, ws.id, region_id, body.name)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return {"ok": True}


@router.post("/regions/merge")
async def merge_regions(workspace: str, body: RegionMerge, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await notify_workspace_data_changed(db, ws.id, ctx.org_id)
        merged = await cr.merge_custom(db, ws.id, body.into_key, body.from_ids)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return {"merged": merged}


@router.delete("/regions/{region_id}", status_code=204)
async def remove_region(region_id: str, workspace: str, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> Response:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await notify_workspace_data_changed(db, ws.id, ctx.org_id)
        await cr.delete_custom(db, ws.id, region_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
