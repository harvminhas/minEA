"""Tech debt items attached to a repository object (drawer tab)."""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product
from app.services.portfolio_signals import _is_open_debt, _normalize_object_id
from app.services.product_detail import (
    _debt_item_from_row,
    _debt_remediation_map,
    _object_owner_map,
)
from app.services.product_scope import resolve_product_scope

TECH_DEBT_HOST_TYPES = (
    "application",
    "solution",
    "technical_capability",
    "component",
    "api",
    "event",
    "integration_flow",
    "tool",
    "data_object",
    "data_store",
    "data_domain",
    "cloud_service",
    "model",
)

ROLLUP_HOST_TYPES = ("application", "solution", "technical_capability", "component")


def _debt_attached_to_host(props: dict | None, host_id: str, host_type: str) -> bool:
    if not props:
        return False
    affects = props.get("affects") or {}
    if affects.get("object_kind") != host_type:
        return False
    return _normalize_object_id(affects.get("object_id")) == host_id


async def _build_host_product_rollup_index(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict[str, list[dict[str, str]]]:
    """Map system/component id → products that include it in scope (one pass per workspace)."""
    index: dict[str, list[dict[str, str]]] = defaultdict(list)
    result = await db.execute(
        select(Product.id, Product.name).where(
            Product.workspace_id == workspace_id,
            Product.org_id == org_id,
        )
    )
    for product_id, product_name in result.all():
        scope = await resolve_product_scope(db, product_id, workspace_id, org_id)
        scope_strs = {str(sid) for sid in scope.system_ids} | {str(sid) for sid in scope.component_ids}
        entry = {"id": str(product_id), "name": product_name}
        for host_key in scope_strs:
            if not any(p["id"] == entry["id"] for p in index[host_key]):
                index[host_key].append(entry)
    for host_key in index:
        index[host_key].sort(key=lambda p: p["name"].lower())
    return dict(index)


async def _rollup_products_for_host(
    db: AsyncSession,
    host_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[dict[str, str]]:
    index = await _build_host_product_rollup_index(db, workspace_id, org_id)
    return index.get(str(host_id), [])


async def tech_debt_summary_for_object(
    db: AsyncSession,
    host_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict:
    host_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == host_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    host = host_result.scalar_one_or_none()
    if host is None or host.type not in TECH_DEBT_HOST_TYPES:
        return {"open_count": 0, "items": [], "rollup_products": []}

    host_key = str(host_id)
    host_type = host.type
    seen: set[uuid.UUID] = set()
    ranked: list[tuple[int, dict, str | None]] = []

    debt_cols = select(
        MinEAObject.id,
        MinEAObject.name,
        MinEAObject.properties,
        MinEAObject.created_at,
    ).where(
        MinEAObject.type == "tech_debt",
        MinEAObject.workspace_id == workspace_id,
        MinEAObject.org_id == org_id,
    )

    rel_result = await db.execute(
        debt_cols.join(Relationship, Relationship.from_object_id == MinEAObject.id).where(
            Relationship.type == "affects",
            Relationship.from_type == "tech_debt",
            Relationship.to_object_id == host_id,
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )
    for row in rel_result.all():
        debt_id = row[0]
        if debt_id in seen:
            continue
        item = _debt_item_from_row(row)
        if not item:
            continue
        seen.add(debt_id)
        ranked.append((item.pop("_rank"), item, item.pop("_affect_oid", None)))

    all_debt = await db.execute(debt_cols)
    for row in all_debt.all():
        debt_id, _, props, _ = row
        if debt_id in seen:
            continue
        if not _debt_attached_to_host(props, host_key, host_type):
            continue
        item = _debt_item_from_row(row)
        if not item:
            continue
        seen.add(debt_id)
        ranked.append((item.pop("_rank"), item, item.pop("_affect_oid", None)))

    ranked.sort(key=lambda x: x[0])
    debt_ids = {uuid.UUID(item["id"]) for _, item, _ in ranked}
    remediation = await _debt_remediation_map(db, debt_ids, workspace_id, org_id)

    affect_uuid_set: set[uuid.UUID] = set()
    for _, _, affect_oid in ranked:
        if affect_oid:
            try:
                affect_uuid_set.add(uuid.UUID(affect_oid))
            except ValueError:
                pass

    owners = await _object_owner_map(db, affect_uuid_set, workspace_id)

    result_items: list[dict] = []
    for _, item, affect_oid in ranked:
        debt_id = item["id"]
        owner = owners.get(affect_oid) if affect_oid else None
        rem = remediation.get(debt_id)
        result_items.append(
            {
                **item,
                "owner": owner,
                "remediation": rem,
            }
        )

    rollup_products: list[dict[str, str]] = []
    if host_type in ROLLUP_HOST_TYPES:
        rollup_products = await _rollup_products_for_host(db, host_id, workspace_id, org_id)

    return {
        "open_count": len(result_items),
        "items": result_items,
        "rollup_products": rollup_products,
    }
