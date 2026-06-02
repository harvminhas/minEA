"""Architecture query tools — callable by the insights LLM agent."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product
from app.services.architecture_gaps import compute_architecture_gaps
from app.services.capability_map import load_capability_map
from app.services.workspace_summary import fetch_workspace_summary

SYSTEM_TYPES = ("application", "solution", "technical_capability")


def _object_summary(obj: MinEAObject) -> dict:
    return {
        "id": str(obj.id),
        "type": obj.type,
        "name": obj.name,
        "status": obj.status,
        "owner": obj.owner,
        "properties": obj.properties or {},
    }


async def get_workspace_summary(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> dict:
    summary = await fetch_workspace_summary(db, workspace_id, org_id)

    type_counts: dict[str, int] = {}
    objects_result = await db.execute(
        select(MinEAObject.type, MinEAObject.id).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    for obj_type, _ in objects_result.all():
        type_counts[obj_type] = type_counts.get(obj_type, 0) + 1

    rel_count = await db.execute(
        select(Relationship.id).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )

    return {
        "domain_count": summary.domain_count,
        "capability_count": summary.capability_count,
        "system_count": summary.system_count,
        "product_count": summary.product_count,
        "process_count": summary.process_count,
        "journey_count": summary.journey_count,
        "investment_count": summary.investment_count,
        "map_initialized": summary.map_initialized,
        "object_counts_by_type": type_counts,
        "relationship_count": len(rel_count.all()),
    }


async def get_all_domains(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> list[dict]:
    domains, _ = await load_capability_map(db, workspace_id, org_id)
    return [_object_summary(d) for d in domains]


async def get_all_capabilities(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> list[dict]:
    _, capabilities = await load_capability_map(db, workspace_id, org_id)
    return [_object_summary(c) for c in capabilities]


async def get_all_systems(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type.in_(SYSTEM_TYPES),
        )
        .order_by(MinEAObject.name)
    )
    return [_object_summary(o) for o in result.scalars().all()]


async def get_all_products(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(Product)
        .where(Product.workspace_id == workspace_id, Product.org_id == org_id)
        .options(selectinload(Product.capabilities))
        .order_by(Product.name)
    )
    products = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "owner": p.owner,
            "lifecycle": p.lifecycle,
            "capability_count": len(p.capabilities),
            "capability_ids": [str(pc.capability_id) for pc in p.capabilities],
        }
        for p in products
    ]


async def get_all_roadmap_items(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "roadmap_item",
        )
        .order_by(MinEAObject.updated_at.desc())
    )
    return [_object_summary(o) for o in result.scalars().all()]


async def get_relationships(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    relationship_type: str | None = None,
    from_type: str | None = None,
    to_type: str | None = None,
) -> list[dict]:
    q = select(Relationship).where(
        Relationship.workspace_id == workspace_id,
        Relationship.org_id == org_id,
    )
    if relationship_type:
        q = q.where(Relationship.type == relationship_type)
    if from_type:
        q = q.where(Relationship.from_type == from_type)
    if to_type:
        q = q.where(Relationship.to_type == to_type)

    result = await db.execute(q.limit(500))
    return [
        {
            "id": str(r.id),
            "type": r.type,
            "from_object_id": str(r.from_object_id),
            "from_type": r.from_type,
            "to_object_id": str(r.to_object_id),
            "to_type": r.to_type,
            "attributes": r.attributes or {},
        }
        for r in result.scalars().all()
    ]


async def get_architecture_gaps(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> list[dict]:
    return await compute_architecture_gaps(db, workspace_id, org_id)


TOOL_HANDLERS = {
    "get_workspace_summary": lambda db, ws, org, _input: get_workspace_summary(db, ws, org),
    "get_all_domains": lambda db, ws, org, _input: get_all_domains(db, ws, org),
    "get_all_capabilities": lambda db, ws, org, _input: get_all_capabilities(db, ws, org),
    "get_all_systems": lambda db, ws, org, _input: get_all_systems(db, ws, org),
    "get_all_products": lambda db, ws, org, _input: get_all_products(db, ws, org),
    "get_all_roadmap_items": lambda db, ws, org, _input: get_all_roadmap_items(db, ws, org),
    "get_relationships": lambda db, ws, org, inp: get_relationships(
        db,
        ws,
        org,
        inp.get("relationship_type"),
        inp.get("from_type"),
        inp.get("to_type"),
    ),
    "get_architecture_gaps": lambda db, ws, org, _input: get_architecture_gaps(db, ws, org),
}


ARCHITECTURE_TOOLS = [
    {
        "name": "get_workspace_summary",
        "description": "Get counts of objects by type, relationships, and products in the workspace.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_all_domains",
        "description": "List all business domains on the capability map.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_all_capabilities",
        "description": "List all business capabilities with domain_id, owner, maturity, and investment.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_all_systems",
        "description": "List all systems (applications, solutions, technical capabilities).",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_all_products",
        "description": "List all products with linked capability counts.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_all_roadmap_items",
        "description": "List all roadmap items / investments with status, effort, and product linkage.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_relationships",
        "description": "Query relationships. Filter by type (e.g. supported_by), from_type, or to_type.",
        "input_schema": {
            "type": "object",
            "properties": {
                "relationship_type": {"type": "string", "description": "e.g. supported_by, part_of, resolves"},
                "from_type": {"type": "string"},
                "to_type": {"type": "string"},
            },
            "required": [],
        },
    },
    {
        "name": "get_architecture_gaps",
        "description": (
            "Get pre-computed architecture completeness gaps: empty domains, capabilities without "
            "systems, missing owners, products without capabilities, unlinked investments."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]


async def execute_tool(
    tool_name: str,
    tool_input: dict,
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> object:
    handler = TOOL_HANDLERS.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}
    return await handler(db, workspace_id, org_id, tool_input)
