"""Vendor contracts: CRUD plus the apps each contract covers (seats and in use per app)."""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.contracts import VendorContract, VendorContractItem
from app.models.objects import MinEAObject
from app.models.people import PeopleContact
from app.services.audit import log_audit
from app.services.contracts import contract_payload
from app.services.snapshot_hooks import notify_workspace_data_changed
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/contracts", tags=["contracts"])


class ItemIn(BaseModel):
    object_id: UUID
    seats: int | None = Field(default=None, ge=0)
    in_use: int | None = Field(default=None, ge=0)


class ItemPatch(BaseModel):
    seats: int | None = Field(default=None, ge=0)
    in_use: int | None = Field(default=None, ge=0)


class ContractIn(BaseModel):
    name: str | None = None
    vendor_id: UUID | None = None
    annual_cost_cents: int | None = Field(default=None, ge=0)
    start_date: date | None = None
    end_date: date | None = None
    notice_days: int | None = Field(default=None, ge=0, le=3650)
    auto_renew: bool | None = None
    owner_contact_id: UUID | None = None
    document_url: str | None = None
    items: list[ItemIn] | None = None


async def _vendor(db: AsyncSession, ctx: TenancyContext, vendor_id: UUID | None) -> MinEAObject | None:
    if vendor_id is None:
        return None
    obj = await db.get(MinEAObject, vendor_id)
    if not obj or obj.workspace_id != ctx.workspace.id or obj.type != "external_party":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vendor not found in this workspace")
    return obj


async def _check_refs(db: AsyncSession, ctx: TenancyContext, body: ContractIn) -> None:
    if body.owner_contact_id is not None:
        contact = await db.get(PeopleContact, body.owner_contact_id)
        if not contact or contact.workspace_id != ctx.workspace.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Owner not found in this workspace")
    for item in body.items or []:
        await _app(db, ctx, item.object_id)
    if body.start_date and body.end_date and body.end_date < body.start_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "End date is before the start date")


async def _app(db: AsyncSession, ctx: TenancyContext, object_id: UUID) -> MinEAObject:
    obj = await db.get(MinEAObject, object_id)
    if not obj or obj.workspace_id != ctx.workspace.id or obj.type == "external_party":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "App not found in this workspace")
    return obj


async def _get(db: AsyncSession, ctx: TenancyContext, contract_id: UUID) -> VendorContract:
    row = await db.get(VendorContract, contract_id)
    if not row or row.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return row


async def _read(db: AsyncSession, row: VendorContract) -> dict:
    items = (await db.execute(
        select(VendorContractItem).where(VendorContractItem.contract_id == row.id).order_by(VendorContractItem.created_at, VendorContractItem.object_id)
    )).scalars().all()
    vendor = await db.get(MinEAObject, row.vendor_id) if row.vendor_id else None
    return contract_payload(row, list(items), vendor.name if vendor else None)


async def _changed(db: AsyncSession, ctx: TenancyContext, action: str, row: VendorContract) -> None:
    await log_audit(db, org_id=ctx.org_id, actor_user_id=ctx.user_id, action=action, target_type="vendor_contract", target_id=row.id, metadata={"name": row.name})
    await notify_workspace_data_changed(db, ctx.workspace.id, ctx.org_id)


@router.get("")
async def list_contracts(ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)):
    await ctx.require_read(db)
    rows = (await db.execute(
        select(VendorContract).where(VendorContract.workspace_id == ctx.workspace.id).order_by(VendorContract.created_at, VendorContract.id)
    )).scalars().all()
    return [await _read(db, row) for row in rows]


@router.post("", status_code=201)
async def create_contract(body: ContractIn, ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)):
    await ctx.require_write(db)
    vendor = await _vendor(db, ctx, body.vendor_id)
    await _check_refs(db, ctx, body)
    name = (body.name or "").strip() or (f"{vendor.name} contract" if vendor else "Contract")
    row = VendorContract(
        workspace_id=ctx.workspace.id, org_id=ctx.org_id, vendor_id=vendor.id if vendor else None, name=name,
        annual_cost_cents=body.annual_cost_cents, start_date=body.start_date, end_date=body.end_date,
        notice_days=body.notice_days, auto_renew=bool(body.auto_renew), owner_contact_id=body.owner_contact_id,
        document_url=(body.document_url or "").strip() or None, created_by=ctx.user_id,
    )
    db.add(row)
    await db.flush()
    seen: set[UUID] = set()
    for item in body.items or []:
        if item.object_id in seen:
            continue
        seen.add(item.object_id)
        db.add(VendorContractItem(contract_id=row.id, object_id=item.object_id, seats=item.seats, in_use=item.in_use))
    await db.flush()
    await _changed(db, ctx, "contract.create", row)
    return await _read(db, row)


@router.patch("/{contract_id}")
async def update_contract(contract_id: UUID, body: ContractIn, ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)):
    await ctx.require_write(db)
    row = await _get(db, ctx, contract_id)
    fields = body.model_fields_set
    if "vendor_id" in fields:
        await _vendor(db, ctx, body.vendor_id)
    await _check_refs(db, ctx, body)
    if "name" in fields and (body.name or "").strip():
        row.name = body.name.strip()
    for key in ("vendor_id", "annual_cost_cents", "start_date", "end_date", "notice_days", "owner_contact_id"):
        if key in fields:
            setattr(row, key, getattr(body, key))
    if "auto_renew" in fields:
        row.auto_renew = bool(body.auto_renew)
    if "document_url" in fields:
        row.document_url = (body.document_url or "").strip() or None
    if row.start_date and row.end_date and row.end_date < row.start_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "End date is before the start date")
    if body.items is not None:
        existing = (await db.execute(select(VendorContractItem).where(VendorContractItem.contract_id == row.id))).scalars().all()
        for item in existing:
            await db.delete(item)
        await db.flush()
        seen: set[UUID] = set()
        for item in body.items:
            if item.object_id not in seen:
                seen.add(item.object_id)
                db.add(VendorContractItem(contract_id=row.id, object_id=item.object_id, seats=item.seats, in_use=item.in_use))
    await db.flush()
    await _changed(db, ctx, "contract.update", row)
    return await _read(db, row)


@router.put("/{contract_id}/items/{object_id}")
async def upsert_item(contract_id: UUID, object_id: UUID, body: ItemPatch | None = None, ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)):
    """Add an app to the contract, or set its seats / in use."""
    await ctx.require_write(db)
    row = await _get(db, ctx, contract_id)
    await _app(db, ctx, object_id)
    item = await db.get(VendorContractItem, (row.id, object_id))
    seats = body.seats if body else None
    in_use = body.in_use if body else None
    if item:
        if body and "seats" in body.model_fields_set:
            item.seats = seats
        if body and "in_use" in body.model_fields_set:
            item.in_use = in_use
    else:
        db.add(VendorContractItem(contract_id=row.id, object_id=object_id, seats=seats, in_use=in_use))
    await db.flush()
    await _changed(db, ctx, "contract.update", row)
    return await _read(db, row)


@router.delete("/{contract_id}/items/{object_id}")
async def remove_item(contract_id: UUID, object_id: UUID, ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)):
    await ctx.require_write(db)
    row = await _get(db, ctx, contract_id)
    item = await db.get(VendorContractItem, (row.id, object_id))
    if item:
        await db.delete(item)
        await db.flush()
        await _changed(db, ctx, "contract.update", row)
    return await _read(db, row)


@router.delete("/{contract_id}", status_code=204)
async def delete_contract(contract_id: UUID, ctx: TenancyContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)):
    await ctx.require_write(db)
    row = await _get(db, ctx, contract_id)
    await _changed(db, ctx, "contract.delete", row)
    await db.delete(row)
    await db.flush()
    return Response(status_code=204)
