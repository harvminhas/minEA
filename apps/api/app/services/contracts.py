"""Vendor contracts overlay.

A contract covers one or more apps. Its annual cost is split across those apps (by seats when every
covered app has seats, otherwise evenly), and the split replaces each covered app's recurring vendor
cost lines. Every total built from app properties (vendor spend, renewals, idle licences, overlaps,
Ask) then counts the contract exactly once. Apps with no contract, or whose contracts carry no cost,
keep their own cost/licence/renewal fields. Mirrored in apps/web/lib/contracts.ts.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)


def contract_shares(contract: dict[str, Any]) -> dict[str, int]:
    """object_id -> cents of the contract's annual cost charged to that app."""
    items = [item for item in contract.get("items") or [] if item.get("object_id")]
    cost = contract.get("annual_cost_cents")
    if not items or cost is None:
        return {}
    total = int(cost)
    seats = [item.get("seats") for item in items]
    by_seats = all(isinstance(s, int) and s > 0 for s in seats)
    weights = [int(s) for s in seats] if by_seats else [1] * len(items)
    whole = sum(weights)
    shares: dict[str, int] = {}
    given = 0
    for index, item in enumerate(items):
        if index == len(items) - 1:
            part = total - given
        else:
            part = total * weights[index] // whole
        given += part
        oid = str(item["object_id"])
        shares[oid] = shares.get(oid, 0) + part
    return shares


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10] or None


def effective_properties(properties: dict[str, Any] | None, covering: list[dict[str, Any]], object_id: str) -> dict[str, Any]:
    """The app's properties with its contracts applied. Returns the input unchanged when nothing applies."""
    props = dict(properties or {})
    if not covering:
        return props
    costed = [c for c in covering if c.get("annual_cost_cents") is not None]
    if costed:
        own = props.get("cost_lines") if isinstance(props.get("cost_lines"), list) else []
        kept = [
            line for line in own
            if isinstance(line, dict) and (line.get("type") == "internal_estimate" or line.get("frequency") == "one_time")
        ]
        lines = []
        total = 0
        for contract in costed:
            cents = contract_shares(contract).get(object_id, 0)
            total += cents
            lines.append({
                "id": f"contract-{contract.get('id')}",
                "type": "subscription",
                "frequency": "annual",
                "source": "invoice",
                "vendor": contract.get("vendor_name") or "",
                "amount_cents": cents,
                "calculation": {"kind": "flat"},
                "contract_id": str(contract.get("id")),
            })
        props["cost_lines"] = lines + kept
        dollars = total / 100
        props["annual_cost"] = int(dollars) if dollars == int(dollars) else dollars
    seats = [it.get("seats") for c in covering for it in c.get("items") or [] if str(it.get("object_id")) == object_id]
    in_use = [it.get("in_use") for c in covering for it in c.get("items") or [] if str(it.get("object_id")) == object_id]
    if any(isinstance(s, int) for s in seats):
        props["licence_count"] = sum(s for s in seats if isinstance(s, int))
    if any(isinstance(s, int) for s in in_use):
        props["licences_in_use"] = sum(s for s in in_use if isinstance(s, int))
    ends = sorted(e for e in (_iso(c.get("end_date")) for c in covering) if e)
    if ends:
        props["contract_renewal"] = ends[0]
    return props


def covering_by_object(contracts: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for contract in contracts:
        for item in contract.get("items") or []:
            oid = str(item.get("object_id") or "")
            if oid and contract not in out.setdefault(oid, []):
                out[oid].append(contract)
    return out


def contract_payload(row: Any, items: list[Any], vendor_name: str | None = None) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "vendor_id": str(row.vendor_id) if row.vendor_id else None,
        "vendor_name": vendor_name,
        "name": row.name,
        "annual_cost_cents": int(row.annual_cost_cents) if row.annual_cost_cents is not None else None,
        "start_date": _iso(row.start_date),
        "end_date": _iso(row.end_date),
        "notice_days": row.notice_days,
        "auto_renew": bool(row.auto_renew),
        "owner_contact_id": str(row.owner_contact_id) if row.owner_contact_id else None,
        "document_url": row.document_url,
        "items": [
            {"object_id": str(item.object_id), "seats": item.seats, "in_use": item.in_use}
            for item in items
        ],
    }


async def load_contracts(db: AsyncSession, workspace_id: UUID) -> list[dict[str, Any]]:
    """All contracts in a workspace as plain dicts. Empty (never raises) before migration 058 runs."""
    try:
        async with db.begin_nested():
            rows = (await db.execute(text(
                "SELECT c.id, c.vendor_id, o.name AS vendor_name, c.name, c.annual_cost_cents, c.start_date, c.end_date, "
                "c.notice_days, c.auto_renew, c.owner_contact_id, c.document_url "
                "FROM vendor_contracts c LEFT JOIN objects o ON o.id = c.vendor_id "
                "WHERE c.workspace_id = :ws ORDER BY c.created_at, c.id"
            ), {"ws": workspace_id})).mappings().all()
            items = (await db.execute(text(
                "SELECT i.contract_id, i.object_id, i.seats, i.in_use FROM vendor_contract_items i "
                "JOIN vendor_contracts c ON c.id = i.contract_id WHERE c.workspace_id = :ws ORDER BY i.created_at, i.object_id"
            ), {"ws": workspace_id})).mappings().all()
    except Exception as exc:  # table missing before 058, or any read failure: fall back to per-app fields
        log.warning("vendor contracts unavailable: %s", exc)
        return []
    by_contract: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        by_contract.setdefault(str(item["contract_id"]), []).append(
            {"object_id": str(item["object_id"]), "seats": item["seats"], "in_use": item["in_use"]}
        )
    return [
        {
            "id": str(r["id"]),
            "vendor_id": str(r["vendor_id"]) if r["vendor_id"] else None,
            "vendor_name": r["vendor_name"],
            "name": r["name"],
            "annual_cost_cents": int(r["annual_cost_cents"]) if r["annual_cost_cents"] is not None else None,
            "start_date": _iso(r["start_date"]),
            "end_date": _iso(r["end_date"]),
            "notice_days": r["notice_days"],
            "auto_renew": bool(r["auto_renew"]),
            "owner_contact_id": str(r["owner_contact_id"]) if r["owner_contact_id"] else None,
            "document_url": r["document_url"],
            "items": by_contract.get(str(r["id"]), []),
        }
        for r in rows
    ]
