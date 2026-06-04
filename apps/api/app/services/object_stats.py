"""Relationship-based summary stats for system objects (application layer)."""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_layer import DataLink
from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.tenancy import User
from app.services.portfolio_signals import _is_open_debt, _normalize_object_id

SYSTEM_TYPES = ("application", "solution", "technical_capability")
COMPONENT_TYPES = ("component",)
API_TYPES = ("api",)
EVENT_TYPES = ("event",)
FLOW_TYPES = ("integration_flow",)
TECHNOLOGY_TYPES = ("model", "tool", "cloud_service")
DATA_TYPES = ("data_object", "data_store", "data_domain")
UPDATED_BY_ONLY_TYPES = (
    COMPONENT_TYPES + API_TYPES + EVENT_TYPES + FLOW_TYPES + TECHNOLOGY_TYPES
)
TECH_DEBT_HOST_TYPES = (
    SYSTEM_TYPES
    + COMPONENT_TYPES
    + API_TYPES
    + EVENT_TYPES
    + FLOW_TYPES
    + TECHNOLOGY_TYPES
    + DATA_TYPES
)


async def enrich_open_tech_debt_counts(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    """Open tech debt items attached to each host object (relationship + properties.affects)."""
    targets = [o for o in objects if o.type in TECH_DEBT_HOST_TYPES]
    if not targets:
        return {}

    workspace_id = targets[0].workspace_id
    org_id = targets[0].org_id
    host_ids = [o.id for o in targets]
    host_type_by_id = {o.id: o.type for o in targets}

    seen: set[tuple[uuid.UUID, uuid.UUID]] = set()
    counts: dict[uuid.UUID, int] = defaultdict(int)

    rel_result = await db.execute(
        select(Relationship.to_object_id, MinEAObject.id, MinEAObject.properties)
        .join(MinEAObject, MinEAObject.id == Relationship.from_object_id)
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "affects",
            Relationship.from_type == "tech_debt",
            Relationship.to_object_id.in_(host_ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "tech_debt",
        )
    )
    for host_id, debt_id, props in rel_result.all():
        key = (host_id, debt_id)
        if key in seen or not _is_open_debt(props):
            continue
        seen.add(key)
        counts[host_id] += 1

    debt_result = await db.execute(
        select(MinEAObject.id, MinEAObject.properties).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "tech_debt",
        )
    )
    for debt_id, props in debt_result.all():
        if not props or not _is_open_debt(props):
            continue
        affects = props.get("affects") or {}
        host_key = _normalize_object_id(affects.get("object_id"))
        kind = affects.get("object_kind")
        if not host_key or not kind:
            continue
        try:
            host_uuid = uuid.UUID(host_key)
        except (TypeError, ValueError):
            continue
        if host_uuid not in host_type_by_id or host_type_by_id[host_uuid] != kind:
            continue
        key = (host_uuid, debt_id)
        if key in seen:
            continue
        seen.add(key)
        counts[host_uuid] += 1

    return {host_id: {"open_tech_debt_count": counts[host_id]} for host_id in host_ids}


async def enrich_tech_debt_view_items(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    """Rollup products + remediation for tech debt list / view."""
    debts = [o for o in objects if o.type == "tech_debt"]
    if not debts:
        return {}

    from app.services.object_tech_debt import _build_host_product_rollup_index
    from app.services.product_detail import _debt_remediation_map

    workspace_id = debts[0].workspace_id
    org_id = debts[0].org_id
    debt_ids = {o.id for o in debts}
    remediation = await _debt_remediation_map(db, debt_ids, workspace_id, org_id)
    rollup_index = await _build_host_product_rollup_index(db, workspace_id, org_id)

    out: dict[uuid.UUID, dict] = {}
    for debt in debts:
        props = debt.properties or {}
        affects = props.get("affects") or {}
        rollup: list[dict[str, str]] = []
        host_key = affects.get("object_id")
        kind = affects.get("object_kind")
        if host_key and kind in (
            "application",
            "solution",
            "technical_capability",
            "component",
        ):
            rollup = rollup_index.get(str(host_key), [])
        elif kind == "product" and host_key:
            rollup = [{"id": str(host_key), "name": str(affects.get("object_name") or "Product")}]

        rem = remediation.get(str(debt.id))
        if rem is not None and not rem.get("roadmap_title"):
            rem = {**rem, "roadmap_title": "Roadmap item"}

        out[debt.id] = {
            "tech_debt_rollup_products": rollup,
            "tech_debt_remediation": rem,
        }
    return out


async def _count_by_to(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    object_ids: list[uuid.UUID],
    rel_type: str,
) -> dict[uuid.UUID, int]:
    if not object_ids:
        return {}
    result = await db.execute(
        select(Relationship.to_object_id, func.count())
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == rel_type,
            Relationship.to_object_id.in_(object_ids),
        )
        .group_by(Relationship.to_object_id)
    )
    return {row[0]: int(row[1]) for row in result.all()}


async def _count_by_from_to_type(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    object_ids: list[uuid.UUID],
    rel_type: str,
    to_type: str,
) -> dict[uuid.UUID, int]:
    if not object_ids:
        return {}
    result = await db.execute(
        select(Relationship.from_object_id, func.count())
        .where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == rel_type,
            Relationship.from_object_id.in_(object_ids),
            Relationship.to_type == to_type,
        )
        .group_by(Relationship.from_object_id)
    )
    return {row[0]: int(row[1]) for row in result.all()}


async def enrich_system_objects(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    """Batch-compute card metrics for application / solution / technical_capability."""
    system_objs = [o for o in objects if o.type in SYSTEM_TYPES]
    if not system_objs:
        return {}

    workspace_id = system_objs[0].workspace_id
    org_id = system_objs[0].org_id
    ids = [o.id for o in system_objs]

    caps = await _count_by_to(db, workspace_id, org_id, ids, "supported_by")
    apis_provided = await _count_by_from_to_type(db, workspace_id, org_id, ids, "exposes", "api")
    apis_consumed = await _count_by_from_to_type(db, workspace_id, org_id, ids, "consumes", "api")
    data_stores = await _count_by_from_to_type(db, workspace_id, org_id, ids, "stores_in", "data_store")

    updater_ids = list({o.updated_by for o in system_objs if o.updated_by})
    user_map: dict[uuid.UUID, str | None] = {}
    if updater_ids:
        users_result = await db.execute(select(User).where(User.id.in_(updater_ids)))
        for user in users_result.scalars().all():
            name = user.full_name.split()[0] if user.full_name else user.email.split("@")[0]
            user_map[user.id] = name

    out: dict[uuid.UUID, dict] = {}
    for obj in system_objs:
        out[obj.id] = {
            "capability_count": caps.get(obj.id, 0),
            "apis_provided_count": apis_provided.get(obj.id, 0),
            "apis_consumed_count": apis_consumed.get(obj.id, 0),
            "data_store_count": data_stores.get(obj.id, 0),
            "updated_by_name": user_map.get(obj.updated_by) if obj.updated_by else None,
        }
    return out


async def enrich_single_system(db: AsyncSession, obj: MinEAObject) -> dict:
    stats = await enrich_system_objects(db, [obj])
    return stats.get(obj.id, {})


async def enrich_updated_by_objects(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    """Batch-fetch updated_by_name for card-enriched integration/application objects."""
    targets = [o for o in objects if o.type in UPDATED_BY_ONLY_TYPES]
    if not targets:
        return {}

    updater_ids = list({o.updated_by for o in targets if o.updated_by})
    user_map: dict[uuid.UUID, str | None] = {}
    if updater_ids:
        users_result = await db.execute(select(User).where(User.id.in_(updater_ids)))
        for user in users_result.scalars().all():
            name = user.full_name.split()[0] if user.full_name else user.email.split("@")[0]
            user_map[user.id] = name

    return {
        obj.id: {"updated_by_name": user_map.get(obj.updated_by) if obj.updated_by else None}
        for obj in targets
    }


async def enrich_component_objects(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    return await enrich_updated_by_objects(db, objects)


async def enrich_single_component(db: AsyncSession, obj: MinEAObject) -> dict:
    stats = await enrich_updated_by_objects(db, [obj])
    return stats.get(obj.id, {})


async def enrich_api_objects(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    return await enrich_updated_by_objects(db, objects)


async def enrich_single_api(db: AsyncSession, obj: MinEAObject) -> dict:
    stats = await enrich_updated_by_objects(db, [obj])
    return stats.get(obj.id, {})


async def enrich_single_updated_by(db: AsyncSession, obj: MinEAObject) -> dict:
    stats = await enrich_updated_by_objects(db, [obj])
    return stats.get(obj.id, {})


async def _load_object_names(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, ids: list[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    result = await db.execute(
        select(MinEAObject.id, MinEAObject.name).where(
            MinEAObject.id.in_(ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    return {row[0]: row[1] for row in result.all()}


async def _count_data_links(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    subject_type: str,
    subject_ids: list[uuid.UUID],
    link_kind: str,
    entity_kind: str | None = None,
) -> dict[uuid.UUID, int]:
    if not subject_ids:
        return {}
    q = (
        select(DataLink.subject_id, func.count())
        .where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == subject_type,
            DataLink.subject_id.in_(subject_ids),
            DataLink.link_kind == link_kind,
        )
        .group_by(DataLink.subject_id)
    )
    if entity_kind:
        q = q.where(DataLink.entity_kind == entity_kind)
    result = await db.execute(q)
    return {row[0]: int(row[1]) for row in result.all()}


async def _linked_entity_names(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    subject_type: str,
    subject_ids: list[uuid.UUID],
    link_kind: str,
    entity_kind: str,
) -> dict[uuid.UUID, str]:
    if not subject_ids:
        return {}
    result = await db.execute(
        select(DataLink.subject_id, DataLink.entity_id).where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == subject_type,
            DataLink.subject_id.in_(subject_ids),
            DataLink.link_kind == link_kind,
            DataLink.entity_kind == entity_kind,
        )
    )
    pairs = result.all()
    entity_ids = list({row[1] for row in pairs})
    names = await _load_object_names(db, workspace_id, org_id, entity_ids)
    out: dict[uuid.UUID, str] = {}
    for subject_id, entity_id in pairs:
        if subject_id not in out and entity_id in names:
            out[subject_id] = names[entity_id]
    return out


async def enrich_data_objects(
    db: AsyncSession, objects: list[MinEAObject]
) -> dict[uuid.UUID, dict]:
    """Batch-compute card metrics for data_object / data_store / data_domain."""
    data_objs = [o for o in objects if o.type in DATA_TYPES]
    if not data_objs:
        return {}

    workspace_id = data_objs[0].workspace_id
    org_id = data_objs[0].org_id

    entities = [o for o in data_objs if o.type == "data_object"]
    stores = [o for o in data_objs if o.type == "data_store"]
    domains = [o for o in data_objs if o.type == "data_domain"]

    domain_ids: set[uuid.UUID] = set()
    for obj in entities + stores:
        props = obj.properties or {}
        raw = props.get("data_domain_id")
        if raw:
            try:
                domain_ids.add(uuid.UUID(str(raw)))
            except ValueError:
                pass

    domain_names = await _load_object_names(db, workspace_id, org_id, list(domain_ids))

    entity_ids = [o.id for o in entities]
    store_ids = [o.id for o in stores]
    domain_obj_ids = [o.id for o in domains]

    sor_names = await _linked_entity_names(
        db,
        workspace_id,
        org_id,
        subject_type="data_entity",
        subject_ids=entity_ids,
        link_kind="managed_by",
        entity_kind="application",
    )
    cap_counts = await _count_data_links(
        db,
        workspace_id,
        org_id,
        subject_type="data_entity",
        subject_ids=entity_ids,
        link_kind="uses",
    )
    store_entity_counts = await _count_data_links(
        db,
        workspace_id,
        org_id,
        subject_type="data_store",
        subject_ids=store_ids,
        link_kind="stores",
        entity_kind="data_object",
    )
    host_names = await _linked_entity_names(
        db,
        workspace_id,
        org_id,
        subject_type="data_store",
        subject_ids=store_ids,
        link_kind="hosts",
        entity_kind="application",
    )
    domain_entity_counts = await _count_data_links(
        db,
        workspace_id,
        org_id,
        subject_type="data_domain",
        subject_ids=domain_obj_ids,
        link_kind="governs",
        entity_kind="data_object",
    )
    domain_store_counts = await _count_data_links(
        db,
        workspace_id,
        org_id,
        subject_type="data_domain",
        subject_ids=domain_obj_ids,
        link_kind="governs",
        entity_kind="data_store",
    )

    updater_ids = list({o.updated_by for o in data_objs if o.updated_by})
    user_map: dict[uuid.UUID, str | None] = {}
    if updater_ids:
        users_result = await db.execute(select(User).where(User.id.in_(updater_ids)))
        for user in users_result.scalars().all():
            name = user.full_name.split()[0] if user.full_name else user.email.split("@")[0]
            user_map[user.id] = name

    out: dict[uuid.UUID, dict] = {}
    for obj in entities:
        props = obj.properties or {}
        domain_uuid: uuid.UUID | None = None
        raw = props.get("data_domain_id")
        if raw:
            try:
                domain_uuid = uuid.UUID(str(raw))
            except ValueError:
                pass
        out[obj.id] = {
            "updated_by_name": user_map.get(obj.updated_by) if obj.updated_by else None,
            "data_domain_name": domain_names.get(domain_uuid) if domain_uuid else None,
            "system_of_record_name": sor_names.get(obj.id),
            "capability_count": cap_counts.get(obj.id, 0),
            "governed_entity_count": 0,
            "governed_store_count": 0,
            "hosting_system_name": None,
        }

    for obj in stores:
        props = obj.properties or {}
        domain_uuid = None
        raw = props.get("data_domain_id")
        if raw:
            try:
                domain_uuid = uuid.UUID(str(raw))
            except ValueError:
                pass
        out[obj.id] = {
            "updated_by_name": user_map.get(obj.updated_by) if obj.updated_by else None,
            "data_domain_name": domain_names.get(domain_uuid) if domain_uuid else None,
            "hosting_system_name": host_names.get(obj.id),
            "governed_entity_count": store_entity_counts.get(obj.id, 0),
            "governed_store_count": 0,
            "system_of_record_name": None,
            "capability_count": 0,
        }

    for obj in domains:
        out[obj.id] = {
            "updated_by_name": user_map.get(obj.updated_by) if obj.updated_by else None,
            "governed_entity_count": domain_entity_counts.get(obj.id, 0),
            "governed_store_count": domain_store_counts.get(obj.id, 0),
            "data_domain_name": None,
            "system_of_record_name": None,
            "hosting_system_name": None,
            "capability_count": 0,
        }

    return out


async def enrich_single_data(db: AsyncSession, obj: MinEAObject) -> dict:
    stats = await enrich_data_objects(db, [obj])
    return stats.get(obj.id, {})
