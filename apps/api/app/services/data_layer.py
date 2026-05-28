from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_layer import DataLink
from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Process
from app.schemas.data_layer import DataLinkRead


SINGLE_LINK_KINDS = {"governed_by", "managed_by", "system_of_record", "hosts"}


async def _load_objects(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    ids: list[UUID],
) -> dict[UUID, MinEAObject]:
    if not ids:
        return {}
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id.in_(ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    return {o.id: o for o in result.scalars().all()}


async def _load_processes(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    ids: list[UUID],
) -> dict[UUID, Process]:
    if not ids:
        return {}
    result = await db.execute(
        select(Process).where(
            Process.id.in_(ids),
            Process.workspace_id == workspace_id,
            Process.org_id == org_id,
        )
    )
    return {p.id: p for p in result.scalars().all()}


def _object_subtitle(obj: MinEAObject) -> str | None:
    props = obj.properties or {}
    if obj.type == "data_store":
        health = props.get("health")
        store_type = props.get("store_type")
        if health:
            return str(health).replace("_", " ")
        if store_type:
            return str(store_type).replace("_", " ")
    if obj.type == "data_domain":
        team = props.get("owning_team")
        if team:
            return str(team)
    if obj.type == "application":
        return props.get("vendor") or props.get("category")
    if obj.type == "integration_flow":
        freq = props.get("frequency")
        if freq:
            return str(freq).replace("_", " ")
    if obj.type == "business_domain":
        return "capability domain"
    return None


async def resolve_data_links(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    rows: list[DataLink],
) -> list[DataLinkRead]:
    if not rows:
        return []

    object_ids = [
        r.entity_id
        for r in rows
        if r.entity_kind
        in ("data_domain", "data_store", "data_object", "application", "integration_flow", "capability", "business_domain")
    ]
    process_ids = [r.entity_id for r in rows if r.entity_kind == "process"]

    objects = await _load_objects(db, workspace_id, org_id, object_ids)
    processes = await _load_processes(db, workspace_id, org_id, process_ids)

    reads: list[DataLinkRead] = []
    for row in rows:
        name = "Unknown"
        subtitle: str | None = None
        if row.entity_kind == "process":
            process = processes.get(row.entity_id)
            if process:
                name = process.name
        else:
            obj = objects.get(row.entity_id)
            if obj:
                name = obj.name
                subtitle = _object_subtitle(obj)
                if row.link_kind == "governed_by" and obj.type == "data_domain":
                    team = (obj.properties or {}).get("owning_team")
                    if team:
                        subtitle = str(team)

        reads.append(
            DataLinkRead(
                id=row.id,
                entity_kind=row.entity_kind,
                entity_id=row.entity_id,
                entity_name=name,
                link_kind=row.link_kind,
                role_tag=row.role_tag,
                subtitle=subtitle,
            )
        )
    return reads


async def load_data_links(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    subject_type: str,
    subject_id: UUID,
    link_kinds: list[str] | None = None,
) -> list[DataLinkRead]:
    query = select(DataLink).where(
        DataLink.workspace_id == workspace_id,
        DataLink.org_id == org_id,
        DataLink.subject_type == subject_type,
        DataLink.subject_id == subject_id,
    )
    if link_kinds:
        query = query.where(DataLink.link_kind.in_(link_kinds))
    query = query.order_by(DataLink.link_kind, DataLink.created_at)
    result = await db.execute(query)
    rows = list(result.scalars().all())
    return await resolve_data_links(db, workspace_id, org_id, rows)


async def infer_capabilities_for_entity(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    entity_id: UUID,
    explicit: list[DataLinkRead],
) -> list[DataLinkRead]:
    if explicit:
        return explicit

    managed = await db.execute(
        select(DataLink.entity_id).where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_entity",
            DataLink.subject_id == entity_id,
            DataLink.link_kind == "managed_by",
        )
    )
    app_ids = [row[0] for row in managed.all()]
    if not app_ids:
        return []

    result = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "supported_by",
            Relationship.to_object_id.in_(app_ids),
            Relationship.from_type == "capability",
        )
    )
    cap_ids = list({r.from_object_id for r in result.scalars().all()})
    if not cap_ids:
        return []

    objects = await _load_objects(db, workspace_id, org_id, cap_ids)
    return [
        DataLinkRead(
            id=cap_id,
            entity_kind="capability",
            entity_id=cap_id,
            entity_name=objects[cap_id].name if cap_id in objects else "Unknown",
            link_kind="uses",
            subtitle=None,
        )
        for cap_id in cap_ids
        if cap_id in objects
    ]


async def infer_processes_for_entity(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    entity_id: UUID,
    explicit: list[DataLinkRead],
) -> list[DataLinkRead]:
    return explicit


async def infer_domain_summary(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
) -> list[str]:
    entity_count = await db.scalar(
        select(func.count())
        .select_from(DataLink)
        .where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_domain",
            DataLink.subject_id == domain_id,
            DataLink.link_kind == "governs",
            DataLink.entity_kind == "data_object",
        )
    )
    store_count = await db.scalar(
        select(func.count())
        .select_from(DataLink)
        .where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_domain",
            DataLink.subject_id == domain_id,
            DataLink.link_kind == "governs",
            DataLink.entity_kind == "data_store",
        )
    )
    integration_count = await db.scalar(
        select(func.count())
        .select_from(DataLink)
        .where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_entity",
            DataLink.link_kind == "moved_by",
        )
    )
    capability_count = await db.scalar(
        select(func.count())
        .select_from(DataLink)
        .where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_entity",
            DataLink.link_kind == "uses",
        )
    )

    summary: list[str] = []
    if entity_count:
        summary.append(f"{entity_count} data entit{'y' if entity_count == 1 else 'ies'} governed")
    if store_count:
        summary.append(f"{store_count} data store{'s' if store_count != 1 else ''} governed")
    if integration_count:
        summary.append(f"{integration_count} integration{'s' if integration_count != 1 else ''} move entities in this domain")
    if capability_count:
        summary.append(f"{capability_count} capabilit{'y' if capability_count == 1 else 'ies'} use entities in this domain")
    return summary


async def flow_endpoint_catalog(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
) -> dict:
    apps_result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "application",
        )
        .order_by(MinEAObject.name)
    )
    apps = list(apps_result.scalars().all())
    app_map = {a.id: a for a in apps}

    entities_result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "data_object",
        )
        .order_by(MinEAObject.name)
    )
    entities = list(entities_result.scalars().all())

    links_result = await db.execute(
        select(DataLink).where(
            DataLink.workspace_id == workspace_id,
            DataLink.org_id == org_id,
            DataLink.subject_type == "data_entity",
            DataLink.link_kind == "managed_by",
            DataLink.entity_kind == "application",
        )
    )
    managed_by = list(links_result.scalars().all())
    entity_to_system = {link.subject_id: link.entity_id for link in managed_by}
    system_entity_counts: dict[UUID, int] = {}
    for system_id in entity_to_system.values():
        system_entity_counts[system_id] = system_entity_counts.get(system_id, 0) + 1

    systems_out = []
    for app in apps:
        props = app.properties or {}
        category = props.get("category") or "System"
        vendor = props.get("vendor")
        count = system_entity_counts.get(app.id, 0)
        systems_out.append(
            {
                "id": app.id,
                "name": app.name,
                "category": str(category),
                "vendor": str(vendor) if vendor else None,
                "entity_count": count,
                "connection_label": props.get("connection_label") or app.owner,
            }
        )

    entities_out = []
    for ent in entities:
        props = ent.properties or {}
        system_id = entity_to_system.get(ent.id)
        system = app_map.get(system_id) if system_id else None
        classification = props.get("classification")
        sensitivity = props.get("sensitivity")
        entities_out.append(
            {
                "id": ent.id,
                "name": ent.name,
                "system_id": system_id,
                "system_name": system.name if system else None,
                "classification": str(classification) if classification else None,
                "sensitivity": str(sensitivity) if sensitivity else None,
                "registered": system_id is not None,
            }
        )

    return {"systems": systems_out, "entities": entities_out}


async def validate_link_entity(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    entity_kind: str,
    entity_id: UUID,
) -> None:
    if entity_kind == "process":
        result = await db.execute(
            select(Process.id).where(
                Process.id == entity_id,
                Process.workspace_id == workspace_id,
                Process.org_id == org_id,
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError("Process not found")
        return

    expected_type = {
        "data_domain": "data_domain",
        "data_store": "data_store",
        "data_object": "data_object",
        "application": "application",
        "integration_flow": "integration_flow",
        "capability": "capability",
        "business_domain": "business_domain",
    }.get(entity_kind)
    if not expected_type:
        raise ValueError("Invalid entity kind")

    result = await db.execute(
        select(MinEAObject.id).where(
            MinEAObject.id == entity_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == expected_type,
        )
    )
    if not result.scalar_one_or_none():
        raise ValueError(f"{entity_kind} not found")


async def add_data_link(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    subject_type: str,
    subject_id: UUID,
    entity_kind: str,
    entity_id: UUID,
    link_kind: str,
    role_tag: str | None = None,
) -> None:
    if link_kind in SINGLE_LINK_KINDS:
        await db.execute(
            delete(DataLink).where(
                DataLink.workspace_id == workspace_id,
                DataLink.org_id == org_id,
                DataLink.subject_type == subject_type,
                DataLink.subject_id == subject_id,
                DataLink.link_kind == link_kind,
            )
        )

    db.add(
        DataLink(
            workspace_id=workspace_id,
            org_id=org_id,
            subject_type=subject_type,
            subject_id=subject_id,
            entity_kind=entity_kind,
            entity_id=entity_id,
            link_kind=link_kind,
            role_tag=role_tag,
        )
    )


async def get_domain_name(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID | None,
) -> str | None:
    if not domain_id:
        return None
    result = await db.execute(
        select(MinEAObject.name).where(
            MinEAObject.id == domain_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "data_domain",
        )
    )
    return result.scalar_one_or_none()
