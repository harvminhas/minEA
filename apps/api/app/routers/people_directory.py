"""/orgs/{org}/people-directory: Org settings > People & teams (org admins)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.objects import Workspace
from app.services import people_directory as pd
from app.services.tenancy import TenancyContext, get_org_context

router = APIRouter(prefix="/orgs/{org_slug}/people-directory", tags=["people"])


class MergeBody(BaseModel):
    into_id: str
    from_ids: list[str] = Field(min_length=1, max_length=50)


async def _admin_workspace(ctx: TenancyContext, db: AsyncSession, workspace: str) -> Workspace:
    await ctx.require_org_admin(db)
    ws = (await db.execute(select(Workspace).where(Workspace.org_id == ctx.org_id, Workspace.slug == workspace))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def _kind(kind: str) -> str:
    if kind not in pd.KINDS:
        raise HTTPException(status_code=404, detail="Unknown kind")
    return kind


@router.get("")
async def read_directory(workspace: str, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    return await pd.list_directory(db, ws.id)


@router.post("/{kind}", status_code=201)
async def add_entry(kind: str, workspace: str, body: dict, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        new_id, created = await pd.create(db, _kind(kind), ws.id, ctx.org_id, ctx.user.id, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return {"id": new_id, "created": created}


@router.patch("/{kind}/{row_id}")
async def edit_entry(kind: str, row_id: str, workspace: str, body: dict, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await pd.update(db, _kind(kind), ws.id, row_id, body)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return {"ok": True}


@router.post("/{kind}/merge")
async def merge_entries(kind: str, workspace: str, body: MergeBody, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        merged = await pd.merge(db, _kind(kind), ws.id, body.into_id, body.from_ids)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return {"merged": merged}


@router.get("/{kind}/{row_id}/usage")
async def entry_usage(kind: str, row_id: str, workspace: str, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> dict:
    await _admin_workspace(ctx, db, workspace)
    return {"usage": await pd.usage(db, _kind(kind), row_id)}


@router.delete("/{kind}/{row_id}", status_code=204)
async def delete_entry(kind: str, row_id: str, workspace: str, ctx: TenancyContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> Response:
    ws = await _admin_workspace(ctx, db, workspace)
    try:
        await pd.delete(db, _kind(kind), ws.id, row_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
