"""Build a product-scoped architecture graph for visualization."""
from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product, ProductSystemOverride, Realization, RealizationSystem

TYPE_LAYER: dict[str, int] = {
    "capability": 1,
    "value_stream": 1,
    "application": 2,
    "solution": 2,
    "technical_capability": 2,
    "component": 2,
    "agent": 2,
    "api": 3,
    "data_object": 3,
    "data_store": 3,
    "integration_flow": 3,
    "event": 3,
    "tool": 3,
    "cloud_service": 3,
    "model": 3,
}


async def build_product_graph(db: AsyncSession, product: Product) -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    edge_ids: set[str] = set()

    def add_node(obj_id: uuid.UUID, label: str, node_type: str, layer: int | None = None) -> None:
        sid = str(obj_id)
        if sid not in nodes:
            nodes[sid] = {
                "id": sid,
                "label": label,
                "type": node_type,
                "layer": layer if layer is not None else TYPE_LAYER.get(node_type, 3),
            }

    def add_edge(source: uuid.UUID, target: uuid.UUID, label: str, edge_id: str | None = None) -> None:
        eid = edge_id or f"{source}->{target}:{label}"
        if eid in edge_ids:
            return
        edge_ids.add(eid)
        edges.append(
            {
                "id": eid,
                "source": str(source),
                "target": str(target),
                "label": label.replace("_", " "),
            }
        )

    cap_ids = [pc.capability_id for pc in product.capabilities]
    system_ids: set[uuid.UUID] = set()

    add_node(product.id, product.name, "product", 0)

    if cap_ids:
        cap_result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.id.in_(cap_ids),
                MinEAObject.workspace_id == product.workspace_id,
                MinEAObject.org_id == product.org_id,
            )
        )
        for cap in cap_result.scalars():
            add_node(cap.id, cap.name, "capability", 1)
            add_edge(product.id, cap.id, "delivers")

        via_real = await db.execute(
            select(RealizationSystem.system_id, Realization.capability_id)
            .join(Realization, Realization.id == RealizationSystem.realization_id)
            .where(
                Realization.capability_id.in_(cap_ids),
                Realization.workspace_id == product.workspace_id,
                Realization.org_id == product.org_id,
            )
        )
        for sys_id, cap_id in via_real.all():
            system_ids.add(sys_id)
            add_edge(sys_id, cap_id, "supports")

        via_rel = await db.execute(
            select(Relationship.from_object_id, Relationship.to_object_id, Relationship.type).where(
                Relationship.workspace_id == product.workspace_id,
                Relationship.org_id == product.org_id,
                Relationship.to_object_id.in_(cap_ids),
                Relationship.type.in_(("supports", "supported_by")),
                Relationship.from_type == "application",
            )
        )
        for sys_id, cap_id, rel_type in via_rel.all():
            system_ids.add(sys_id)
            add_edge(sys_id, cap_id, rel_type)

    override_result = await db.execute(
        select(ProductSystemOverride.system_id).where(ProductSystemOverride.product_id == product.id)
    )
    system_ids |= {row[0] for row in override_result.all()}

    if system_ids:
        sys_result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.id.in_(system_ids),
                MinEAObject.workspace_id == product.workspace_id,
                MinEAObject.org_id == product.org_id,
            )
        )
        for sys in sys_result.scalars():
            add_node(sys.id, sys.name, sys.type, 2)

    node_uuids = {uuid.UUID(nid) for nid in nodes if nid != str(product.id)}

    if node_uuids:
        rel_result = await db.execute(
            select(Relationship).where(
                Relationship.workspace_id == product.workspace_id,
                Relationship.org_id == product.org_id,
                or_(
                    Relationship.from_object_id.in_(node_uuids),
                    Relationship.to_object_id.in_(node_uuids),
                ),
            )
        )
        rels = list(rel_result.scalars())

        missing_ids: set[uuid.UUID] = set()
        for rel in rels:
            for oid in (rel.from_object_id, rel.to_object_id):
                if str(oid) not in nodes:
                    missing_ids.add(oid)

        if missing_ids:
            obj_result = await db.execute(
                select(MinEAObject).where(
                    MinEAObject.id.in_(missing_ids),
                    MinEAObject.workspace_id == product.workspace_id,
                    MinEAObject.org_id == product.org_id,
                )
            )
            for obj in obj_result.scalars():
                if obj.type == "capability" and obj.id not in cap_ids:
                    continue
                add_node(obj.id, obj.name, obj.type)

        for rel in rels:
            src, tgt = str(rel.from_object_id), str(rel.to_object_id)
            if src in nodes and tgt in nodes:
                add_edge(rel.from_object_id, rel.to_object_id, rel.type, str(rel.id))

    return {"nodes": list(nodes.values()), "edges": edges}


async def load_product_for_graph(
    db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> Product | None:
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(
            Product.id == product_id,
            Product.workspace_id == workspace_id,
            Product.org_id == org_id,
        )
    )
    return result.scalar_one_or_none()
