from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.catalog_cache import get_catalog, refresh_catalog
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/catalog",
    tags=["catalog"],
)


@router.get("")
async def read_catalog(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await ctx.require_read(db)
    assert ctx.workspace
    return await get_catalog(db, ctx.workspace.id, ctx.org_id)


@router.post("/refresh")
async def rebuild_catalog(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await ctx.require_read(db)
    assert ctx.workspace
    return await refresh_catalog(db, ctx.workspace.id, ctx.org_id)
