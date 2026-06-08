"""Deep-clone workspace content into a new workspace with remapped IDs (no cross-workspace links)."""

from __future__ import annotations

import copy
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_layer import DataLink
from app.models.objects import MinEAObject, Workspace
from app.models.people import PeopleAccountability, PeopleRole, Team, TeamRoleAssignment
from app.models.relationships import Relationship
from app.models.views_graph import (
    Process,
    Product,
    ProductCapability,
    ProductSystemOverride,
    Realization,
    RealizationSystem,
    Stage,
    StageCapability,
)
from app.services.workspace_copy_layers import (
    VALID_LAYER_IDS,
    WORKSPACE_COPY_LAYERS,
    object_types_for_layers,
)
from app.services.snapshot_hooks import notify_workspace_data_changed


def _remap_json(value: Any, id_map: dict[uuid.UUID, uuid.UUID]) -> Any:
    if isinstance(value, dict):
        return {k: _remap_json(v, id_map) for k, v in value.items()}
    if isinstance(value, list):
        return [_remap_json(v, id_map) for v in value]
    if isinstance(value, str):
        try:
            uid = uuid.UUID(value)
        except ValueError:
            return value
        return str(id_map.get(uid, uid))
    return value


def _new_id(id_map: dict[uuid.UUID, uuid.UUID], old_id: uuid.UUID) -> uuid.UUID:
    if old_id not in id_map:
        id_map[old_id] = uuid.uuid4()
    return id_map[old_id]


async def get_workspace_copy_preview(db: AsyncSession, workspace_id: uuid.UUID) -> list[dict]:
    layers: list[dict] = []
    for layer in WORKSPACE_COPY_LAYERS:
        layer_id = layer["id"]
        count = await _count_layer(db, workspace_id, layer_id)
        layers.append({**layer, "count": count})
    return layers


async def _count_layer(db: AsyncSession, workspace_id: uuid.UUID, layer_id: str) -> int:
    if layer_id == "strategy":
        products = await db.scalar(
            select(func.count()).select_from(Product).where(Product.workspace_id == workspace_id)
        )
        roadmaps = await db.scalar(
            select(func.count())
            .select_from(MinEAObject)
            .where(MinEAObject.workspace_id == workspace_id, MinEAObject.type == "roadmap_item")
        )
        return int(products or 0) + int(roadmaps or 0)

    if layer_id == "business":
        domains = await db.scalar(
            select(func.count())
            .select_from(MinEAObject)
            .where(MinEAObject.workspace_id == workspace_id, MinEAObject.type == "business_domain")
        )
        capabilities = await db.scalar(
            select(func.count())
            .select_from(MinEAObject)
            .where(MinEAObject.workspace_id == workspace_id, MinEAObject.type == "capability")
        )
        processes = await db.scalar(
            select(func.count()).select_from(Process).where(Process.workspace_id == workspace_id)
        )
        return int(domains or 0) + int(capabilities or 0) + int(processes or 0)

    if layer_id == "people":
        roles = await db.scalar(
            select(func.count()).select_from(PeopleRole).where(PeopleRole.workspace_id == workspace_id)
        )
        teams = await db.scalar(
            select(func.count()).select_from(Team).where(Team.workspace_id == workspace_id)
        )
        return int(roles or 0) + int(teams or 0)

    types = object_types_for_layers([layer_id])
    if not types:
        return 0
    total = await db.scalar(
        select(func.count())
        .select_from(MinEAObject)
        .where(MinEAObject.workspace_id == workspace_id, MinEAObject.type.in_(types))
    )
    return int(total or 0)


async def copy_workspace_layers(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    layer_ids: list[str],
    actor_user_id: uuid.UUID | None,
) -> None:
    """Copy selected layers into target. All entities get new IDs; relationships stay internal."""
    valid_layers = [lid for lid in layer_ids if lid in VALID_LAYER_IDS]
    if not valid_layers:
        return

    object_id_map: dict[uuid.UUID, uuid.UUID] = {}
    product_id_map: dict[uuid.UUID, uuid.UUID] = {}
    process_id_map: dict[uuid.UUID, uuid.UUID] = {}
    stage_id_map: dict[uuid.UUID, uuid.UUID] = {}
    role_id_map: dict[uuid.UUID, uuid.UUID] = {}
    team_id_map: dict[uuid.UUID, uuid.UUID] = {}
    realization_id_map: dict[uuid.UUID, uuid.UUID] = {}

    await _copy_objects(db, source, target, valid_layers, object_id_map, actor_user_id)
    await db.flush()

    if "strategy" in valid_layers:
        await _copy_strategy_tables(
            db, source, target, object_id_map, product_id_map, realization_id_map, actor_user_id
        )

    if "business" in valid_layers:
        await _copy_processes(db, source, target, object_id_map, process_id_map, stage_id_map)

    if "people" in valid_layers:
        await _copy_people(db, source, target, object_id_map, product_id_map, process_id_map, role_id_map, team_id_map)

    if "data" in valid_layers:
        await _copy_data_links(db, source, target, object_id_map, product_id_map, process_id_map)

    await db.flush()
    await _copy_relationships(db, source, target, object_id_map, actor_user_id)

    # Remap JSONB references now that all ID maps are populated.
    await _remap_object_properties(db, target.id, object_id_map)
    await _remap_product_graph_layouts(db, target.id, object_id_map, product_id_map)
    await _remap_process_layouts(db, target.id, stage_id_map)

    await notify_workspace_data_changed(db, target.id, target.org_id)


async def _copy_objects(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    layer_ids: list[str],
    object_id_map: dict[uuid.UUID, uuid.UUID],
    actor_user_id: uuid.UUID | None,
) -> None:
    types = object_types_for_layers(layer_ids)
    if not types:
        return

    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == source.id,
            MinEAObject.type.in_(types),
        )
    )
    objects = list(result.scalars().all())
    type_rank = {t: i for i, t in enumerate(object_types_for_layers(layer_ids))}
    objects.sort(key=lambda o: type_rank.get(o.type, 999))

    for obj in objects:
        new_id = _new_id(object_id_map, obj.id)
        clone = MinEAObject(
            id=new_id,
            workspace_id=target.id,
            org_id=target.org_id,
            type=obj.type,
            name=obj.name,
            description=obj.description,
            owner=obj.owner,
            status=obj.status,
            tags=list(obj.tags or []),
            external_id=obj.external_id,
            source=obj.source,
            confidence=obj.confidence,
            properties=copy.deepcopy(obj.properties or {}),
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        db.add(clone)


async def _copy_relationships(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    actor_user_id: uuid.UUID | None,
) -> None:
    if not object_id_map:
        return

    result = await db.execute(
        select(Relationship).where(Relationship.workspace_id == source.id)
    )
    for rel in result.scalars().all():
        if rel.from_object_id not in object_id_map or rel.to_object_id not in object_id_map:
            continue
        db.add(
            Relationship(
                workspace_id=target.id,
                org_id=target.org_id,
                type=rel.type,
                from_object_id=object_id_map[rel.from_object_id],
                from_type=rel.from_type,
                to_object_id=object_id_map[rel.to_object_id],
                to_type=rel.to_type,
                attributes=copy.deepcopy(rel.attributes or {}),
                created_by=actor_user_id,
            )
        )


async def _copy_strategy_tables(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    product_id_map: dict[uuid.UUID, uuid.UUID],
    realization_id_map: dict[uuid.UUID, uuid.UUID],
    actor_user_id: uuid.UUID | None,
) -> None:
    products = (
        await db.execute(select(Product).where(Product.workspace_id == source.id))
    ).scalars().all()

    for product in products:
        new_product_id = _new_id(product_id_map, product.id)
        db.add(
            Product(
                id=new_product_id,
                workspace_id=target.id,
                org_id=target.org_id,
                name=product.name,
                product_line=product.product_line,
                lifecycle=product.lifecycle,
                owner=product.owner,
                description=product.description,
                graph_layout=copy.deepcopy(product.graph_layout) if product.graph_layout else None,
                created_by=actor_user_id,
                updated_by=actor_user_id,
            )
        )

    await db.flush()

    for product in products:
        new_product_id = product_id_map[product.id]
        caps = (
            await db.execute(
                select(ProductCapability).where(ProductCapability.product_id == product.id)
            )
        ).scalars().all()
        for pc in caps:
            if pc.capability_id not in object_id_map:
                continue
            db.add(
                ProductCapability(
                    product_id=new_product_id,
                    capability_id=object_id_map[pc.capability_id],
                )
            )
        overrides = (
            await db.execute(
                select(ProductSystemOverride).where(ProductSystemOverride.product_id == product.id)
            )
        ).scalars().all()
        for po in overrides:
            if po.system_id not in object_id_map:
                continue
            db.add(
                ProductSystemOverride(
                    product_id=new_product_id,
                    system_id=object_id_map[po.system_id],
                )
            )

    realizations = (
        await db.execute(select(Realization).where(Realization.workspace_id == source.id))
    ).scalars().all()
    for real in realizations:
        if real.capability_id not in object_id_map:
            continue
        new_real_id = _new_id(realization_id_map, real.id)
        db.add(
            Realization(
                id=new_real_id,
                workspace_id=target.id,
                org_id=target.org_id,
                capability_id=object_id_map[real.capability_id],
                maturity=real.maturity,
                owner=real.owner,
                cost=real.cost,
                volume_pct=real.volume_pct,
                notes=real.notes,
            )
        )

    await db.flush()

    for real in realizations:
        if real.id not in realization_id_map:
            continue
        systems = (
            await db.execute(
                select(RealizationSystem).where(RealizationSystem.realization_id == real.id)
            )
        ).scalars().all()
        for rs in systems:
            if rs.system_id not in object_id_map:
                continue
            db.add(
                RealizationSystem(
                    realization_id=realization_id_map[real.id],
                    system_id=object_id_map[rs.system_id],
                )
            )


async def _copy_processes(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    process_id_map: dict[uuid.UUID, uuid.UUID],
    stage_id_map: dict[uuid.UUID, uuid.UUID],
) -> None:
    processes = (
        await db.execute(select(Process).where(Process.workspace_id == source.id))
    ).scalars().all()

    for proc in processes:
        new_proc_id = _new_id(process_id_map, proc.id)
        db.add(
            Process(
                id=new_proc_id,
                workspace_id=target.id,
                org_id=target.org_id,
                name=proc.name,
                trigger_event=proc.trigger_event,
                value_delivered=proc.value_delivered,
                description=proc.description,
                owner=proc.owner,
                status=proc.status,
                canvas_layout=copy.deepcopy(proc.canvas_layout) if proc.canvas_layout else None,
                graph_edges=copy.deepcopy(proc.graph_edges) if proc.graph_edges else None,
            )
        )

    await db.flush()

    for proc in processes:
        new_proc_id = process_id_map[proc.id]
        stages = (
            await db.execute(select(Stage).where(Stage.process_id == proc.id))
        ).scalars().all()
        for stage in stages:
            new_stage_id = _new_id(stage_id_map, stage.id)
            db.add(
                Stage(
                    id=new_stage_id,
                    process_id=new_proc_id,
                    position=stage.position,
                    name=stage.name,
                    cycle_time_current=stage.cycle_time_current,
                    cycle_time_target=stage.cycle_time_target,
                    owner=stage.owner,
                    typical_duration=stage.typical_duration,
                    transition_condition=stage.transition_condition,
                    transition_trigger=stage.transition_trigger,
                    transition_handoff=stage.transition_handoff,
                )
            )

    await db.flush()

    for proc in processes:
        stages = (
            await db.execute(select(Stage).where(Stage.process_id == proc.id))
        ).scalars().all()
        for stage in stages:
            if stage.id not in stage_id_map:
                continue
            caps = (
                await db.execute(
                    select(StageCapability).where(StageCapability.stage_id == stage.id)
                )
            ).scalars().all()
            for sc in caps:
                if sc.capability_id not in object_id_map:
                    continue
                db.add(
                    StageCapability(
                        stage_id=stage_id_map[stage.id],
                        capability_id=object_id_map[sc.capability_id],
                    )
                )


async def _copy_people(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    product_id_map: dict[uuid.UUID, uuid.UUID],
    process_id_map: dict[uuid.UUID, uuid.UUID],
    role_id_map: dict[uuid.UUID, uuid.UUID],
    team_id_map: dict[uuid.UUID, uuid.UUID],
) -> None:
    roles = (
        await db.execute(select(PeopleRole).where(PeopleRole.workspace_id == source.id))
    ).scalars().all()
    for role in roles:
        _new_id(role_id_map, role.id)
        db.add(
            PeopleRole(
                id=role_id_map[role.id],
                workspace_id=target.id,
                org_id=target.org_id,
                name=role.name,
                role_kind=role.role_kind,
                description=role.description,
                created_by=role.created_by,
            )
        )

    teams = (
        await db.execute(select(Team).where(Team.workspace_id == source.id))
    ).scalars().all()
    for team in teams:
        _new_id(team_id_map, team.id)
        db.add(
            Team(
                id=team_id_map[team.id],
                workspace_id=target.id,
                org_id=target.org_id,
                name=team.name,
                description=team.description,
                lead_name=team.lead_name,
                lead_email=team.lead_email,
                created_by=team.created_by,
            )
        )

    await db.flush()

    assignments = (
        await db.execute(
            select(TeamRoleAssignment).where(
                TeamRoleAssignment.team_id.in_([t.id for t in teams])
            )
        )
    ).scalars().all()
    for assignment in assignments:
        if assignment.team_id not in team_id_map or assignment.people_role_id not in role_id_map:
            continue
        db.add(
            TeamRoleAssignment(
                team_id=team_id_map[assignment.team_id],
                people_role_id=role_id_map[assignment.people_role_id],
                assignee_name=assignment.assignee_name,
                assignee_email=assignment.assignee_email,
                assignment_kind=assignment.assignment_kind,
            )
        )

    accountabilities = (
        await db.execute(
            select(PeopleAccountability).where(PeopleAccountability.workspace_id == source.id)
        )
    ).scalars().all()
    for acc in accountabilities:
        new_subject_id = _remap_people_subject(acc.subject_type, acc.subject_id, role_id_map, team_id_map)
        new_entity_id = _remap_people_entity(
            acc.entity_kind, acc.entity_id, object_id_map, product_id_map, process_id_map
        )
        if new_subject_id is None or new_entity_id is None:
            continue
        db.add(
            PeopleAccountability(
                workspace_id=target.id,
                org_id=target.org_id,
                subject_type=acc.subject_type,
                subject_id=new_subject_id,
                entity_kind=acc.entity_kind,
                entity_id=new_entity_id,
                link_kind=acc.link_kind,
            )
        )


def _remap_people_subject(
    subject_type: str,
    subject_id: uuid.UUID,
    role_id_map: dict[uuid.UUID, uuid.UUID],
    team_id_map: dict[uuid.UUID, uuid.UUID],
) -> uuid.UUID | None:
    if subject_type == "role":
        return role_id_map.get(subject_id)
    if subject_type == "team":
        return team_id_map.get(subject_id)
    return None


def _remap_people_entity(
    entity_kind: str,
    entity_id: uuid.UUID,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    product_id_map: dict[uuid.UUID, uuid.UUID],
    process_id_map: dict[uuid.UUID, uuid.UUID],
) -> uuid.UUID | None:
    if entity_kind == "product":
        return product_id_map.get(entity_id)
    if entity_kind == "process":
        return process_id_map.get(entity_id)
    if entity_kind in {"capability", "business_domain", "application", "data_domain", "data_store"}:
        return object_id_map.get(entity_id)
    return None


async def _copy_data_links(
    db: AsyncSession,
    source: Workspace,
    target: Workspace,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    product_id_map: dict[uuid.UUID, uuid.UUID],
    process_id_map: dict[uuid.UUID, uuid.UUID],
) -> None:
    links = (
        await db.execute(select(DataLink).where(DataLink.workspace_id == source.id))
    ).scalars().all()
    for link in links:
        new_subject = _remap_data_subject(link.subject_type, link.subject_id, object_id_map)
        new_entity = _remap_data_entity(link.entity_kind, link.entity_id, object_id_map, product_id_map, process_id_map)
        if new_subject is None or new_entity is None:
            continue
        db.add(
            DataLink(
                workspace_id=target.id,
                org_id=target.org_id,
                subject_type=link.subject_type,
                subject_id=new_subject,
                entity_kind=link.entity_kind,
                entity_id=new_entity,
                link_kind=link.link_kind,
                role_tag=link.role_tag,
            )
        )


def _remap_data_subject(subject_type: str, subject_id: uuid.UUID, object_id_map: dict[uuid.UUID, uuid.UUID]) -> uuid.UUID | None:
    if subject_type in {"data_entity", "data_store", "data_domain"}:
        return object_id_map.get(subject_id)
    return None


def _remap_data_entity(
    entity_kind: str,
    entity_id: uuid.UUID,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    product_id_map: dict[uuid.UUID, uuid.UUID],
    process_id_map: dict[uuid.UUID, uuid.UUID],
) -> uuid.UUID | None:
    if entity_kind in {"integration_flow", "api", "event", "application", "component", "data_object"}:
        return object_id_map.get(entity_id)
    if entity_kind == "product":
        return product_id_map.get(entity_id)
    if entity_kind == "process":
        return process_id_map.get(entity_id)
    return object_id_map.get(entity_id)


async def _remap_object_properties(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    object_id_map: dict[uuid.UUID, uuid.UUID],
) -> None:
    result = await db.execute(select(MinEAObject).where(MinEAObject.workspace_id == workspace_id))
    for obj in result.scalars().all():
        if obj.properties:
            obj.properties = _remap_json(obj.properties, object_id_map)


async def _remap_product_graph_layouts(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    object_id_map: dict[uuid.UUID, uuid.UUID],
    product_id_map: dict[uuid.UUID, uuid.UUID],
) -> None:
    combined = {**object_id_map, **product_id_map}
    result = await db.execute(select(Product).where(Product.workspace_id == workspace_id))
    for product in result.scalars().all():
        if product.graph_layout:
            product.graph_layout = _remap_json(product.graph_layout, combined)


async def _remap_process_layouts(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    stage_id_map: dict[uuid.UUID, uuid.UUID],
) -> None:
    result = await db.execute(select(Process).where(Process.workspace_id == workspace_id))
    for proc in result.scalars().all():
        if proc.canvas_layout:
            proc.canvas_layout = _remap_json(proc.canvas_layout, stage_id_map)
        if proc.graph_edges:
            proc.graph_edges = _remap_json(proc.graph_edges, stage_id_map)
