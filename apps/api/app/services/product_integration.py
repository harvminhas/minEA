"""Directional integration rollups for products (APIs, events, flows, data stores)."""
from __future__ import annotations

import uuid

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.services.product_scope import ProductScope, resolve_product_scope

IntegrationItem = dict[str, str]


async def _distinct_target_count(
    db: AsyncSession,
    *,
    rel_type: str,
    from_ids: frozenset[uuid.UUID],
    to_type: str,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> int:
    if not from_ids:
        return 0
    result = await db.execute(
        select(func.count(distinct(Relationship.to_object_id))).where(
            Relationship.type == rel_type,
            Relationship.from_object_id.in_(from_ids),
            Relationship.to_type == to_type,
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )
    return result.scalar_one() or 0


async def _distinct_target_items(
    db: AsyncSession,
    *,
    rel_type: str,
    from_ids: frozenset[uuid.UUID],
    to_type: str,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[IntegrationItem]:
    if not from_ids:
        return []
    result = await db.execute(
        select(distinct(Relationship.to_object_id), MinEAObject.name)
        .join(MinEAObject, MinEAObject.id == Relationship.to_object_id)
        .where(
            Relationship.type == rel_type,
            Relationship.from_object_id.in_(from_ids),
            Relationship.to_type == to_type,
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            MinEAObject.workspace_id == workspace_id,
        )
        .order_by(MinEAObject.name)
    )
    return [{"id": str(oid), "name": name, "kind": to_type} for oid, name in result.all()]


def _flow_side_touches_scope(side: dict | None, scope: ProductScope) -> bool:
    if not side:
        return False
    scope_strs = {str(s) for s in scope.system_ids | scope.component_ids}
    for sys in side.get("systems") or []:
        sid = sys.get("system_id")
        if sid and str(sid) in scope_strs:
            return True
    for ent in side.get("entities") or []:
        sid = ent.get("system_id")
        eid = ent.get("entity_id")
        if sid and str(sid) in scope_strs:
            return True
        if eid and str(eid) in scope_strs:
            return True
    return False


async def _flow_counts(
    db: AsyncSession,
    scope: ProductScope,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> tuple[int, int, list[IntegrationItem], list[IntegrationItem]]:
    result = await db.execute(
        select(MinEAObject.id, MinEAObject.name, MinEAObject.properties).where(
            MinEAObject.type == "integration_flow",
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    flows_in: list[IntegrationItem] = []
    flows_out: list[IntegrationItem] = []
    for flow_id, name, props in result.all():
        props = props or {}
        item = {"id": str(flow_id), "name": name, "kind": "integration_flow"}
        if _flow_side_touches_scope(props.get("destinations"), scope):
            flows_in.append(item)
        if _flow_side_touches_scope(props.get("sources"), scope):
            flows_out.append(item)
    return len(flows_in), len(flows_out), flows_in, flows_out


async def _distinct_target_items_multi(
    db: AsyncSession,
    *,
    rel_types: frozenset[str],
    from_ids: frozenset[uuid.UUID],
    to_type: str,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[IntegrationItem]:
    if not from_ids:
        return []
    result = await db.execute(
        select(distinct(Relationship.to_object_id), MinEAObject.name)
        .join(MinEAObject, MinEAObject.id == Relationship.to_object_id)
        .where(
            Relationship.type.in_(rel_types),
            Relationship.from_object_id.in_(from_ids),
            Relationship.to_type == to_type,
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            MinEAObject.workspace_id == workspace_id,
        )
        .order_by(MinEAObject.name)
    )
    return [{"id": str(oid), "name": name, "kind": to_type} for oid, name in result.all()]


DATA_STORE_ACCESS_TYPES = frozenset({"reads", "writes", "owns"})


async def _data_store_count_and_items(
    db: AsyncSession,
    scope: ProductScope,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> tuple[int, list[IntegrationItem]]:
    if not scope.system_ids:
        return 0, []
    items = await _distinct_target_items_multi(
        db,
        rel_types=DATA_STORE_ACCESS_TYPES,
        from_ids=scope.system_ids,
        to_type="data_store",
        workspace_id=workspace_id,
        org_id=org_id,
    )
    return len(items), items


async def integration_counts_for_product(
    db: AsyncSession,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    scope: ProductScope | None = None,
) -> dict[str, int]:
    scope = scope or await resolve_product_scope(db, product_id, workspace_id, org_id)
    flows_in, flows_out, _, _ = await _flow_counts(db, scope, workspace_id, org_id)
    data_store_count, _ = await _data_store_count_and_items(db, scope, workspace_id, org_id)

    return {
        "apis_provided_count": await _distinct_target_count(
            db,
            rel_type="exposes",
            from_ids=scope.provider_ids,
            to_type="api",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "apis_consumed_count": await _distinct_target_count(
            db,
            rel_type="consumes",
            from_ids=scope.consumer_ids,
            to_type="api",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "events_produced_count": await _distinct_target_count(
            db,
            rel_type="publishes",
            from_ids=scope.provider_ids,
            to_type="event",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "events_subscribed_count": await _distinct_target_count(
            db,
            rel_type="subscribes",
            from_ids=scope.consumer_ids,
            to_type="event",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "flows_in_count": flows_in,
        "flows_out_count": flows_out,
        "data_store_count": data_store_count,
    }


async def integration_detail_for_product(
    db: AsyncSession,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    scope: ProductScope | None = None,
) -> dict[str, list[IntegrationItem]]:
    scope = scope or await resolve_product_scope(db, product_id, workspace_id, org_id)
    _, _, flows_in, flows_out = await _flow_counts(db, scope, workspace_id, org_id)
    _, data_stores = await _data_store_count_and_items(db, scope, workspace_id, org_id)

    return {
        "apis_provided": await _distinct_target_items(
            db,
            rel_type="exposes",
            from_ids=scope.provider_ids,
            to_type="api",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "apis_consumed": await _distinct_target_items(
            db,
            rel_type="consumes",
            from_ids=scope.consumer_ids,
            to_type="api",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "events_produced": await _distinct_target_items(
            db,
            rel_type="publishes",
            from_ids=scope.provider_ids,
            to_type="event",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "events_subscribed": await _distinct_target_items(
            db,
            rel_type="subscribes",
            from_ids=scope.consumer_ids,
            to_type="event",
            workspace_id=workspace_id,
            org_id=org_id,
        ),
        "flows_in": flows_in,
        "flows_out": flows_out,
        "data_stores": data_stores,
    }
