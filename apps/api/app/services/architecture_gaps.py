"""Deterministic architecture gap detection — baseline for AI insights."""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product
from app.services.capability_map import load_capability_map

SYSTEM_TYPES = ("application", "solution", "technical_capability")


async def compute_architecture_gaps(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> list[dict]:
    """Return structured gaps matching common EA completeness checks."""
    gaps: list[dict] = []

    domains, capabilities = await load_capability_map(db, workspace_id, org_id)

    caps_by_domain: dict[str, list[MinEAObject]] = defaultdict(list)
    for cap in capabilities:
        domain_id = (cap.properties or {}).get("domain_id")
        if domain_id:
            caps_by_domain[str(domain_id)].append(cap)

    empty_domains = [d for d in domains if not caps_by_domain.get(str(d.id))]
    if empty_domains:
        gaps.append(
            {
                "type": "gap",
                "severity": "high",
                "title": f"{len(empty_domains)} domain{'s' if len(empty_domains) != 1 else ''} have no capabilities",
                "examples": [d.name for d in empty_domains[:5]],
                "impact_note": "The capability heatmap will be incomplete until these are defined.",
                "affected_object_ids": [str(d.id) for d in empty_domains],
            }
        )

    cap_ids = [c.id for c in capabilities]
    supported_cap_ids: set[str] = set()
    if cap_ids:
        rel_result = await db.execute(
            select(Relationship.from_object_id).where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.type == "supported_by",
                Relationship.from_object_id.in_(cap_ids),
                Relationship.to_type.in_(SYSTEM_TYPES),
            )
        )
        supported_cap_ids = {str(row[0]) for row in rel_result.all()}

    caps_without_system = [c for c in capabilities if str(c.id) not in supported_cap_ids]
    if caps_without_system:
        gaps.append(
            {
                "type": "gap",
                "severity": "high",
                "title": f"{len(caps_without_system)} capabilit{'ies' if len(caps_without_system) != 1 else 'y'} have no system",
                "examples": [c.name for c in caps_without_system[:5]],
                "impact_note": "These may be manual or unmapped — worth reviewing.",
                "affected_object_ids": [str(c.id) for c in caps_without_system],
            }
        )

    caps_without_owner = [c for c in capabilities if not (c.owner or "").strip()]
    if caps_without_owner:
        gaps.append(
            {
                "type": "gap",
                "severity": "medium",
                "title": f"{len(caps_without_owner)} capabilit{'ies' if len(caps_without_owner) != 1 else 'y'} have no owner",
                "examples": [c.name for c in caps_without_owner[:5]],
                "impact_note": "Accountability reporting will be incomplete.",
                "affected_object_ids": [str(c.id) for c in caps_without_owner],
            }
        )

    products_result = await db.execute(
        select(Product)
        .where(Product.workspace_id == workspace_id, Product.org_id == org_id)
        .options(selectinload(Product.capabilities))
    )
    products = list(products_result.scalars().all())
    products_no_caps = [p for p in products if not p.capabilities]
    if products_no_caps:
        gaps.append(
            {
                "type": "gap",
                "severity": "medium",
                "title": f"{len(products_no_caps)} product{'s' if len(products_no_caps) != 1 else ''} reference no capabilities",
                "examples": [p.name for p in products_no_caps[:5]],
                "impact_note": "Product portfolio health signals will be incomplete.",
                "affected_object_ids": [str(p.id) for p in products_no_caps],
            }
        )

    roadmap_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "roadmap_item",
        )
    )
    roadmap_items = list(roadmap_result.scalars().all())
    unlinked_investments = [
        item
        for item in roadmap_items
        if not (item.properties or {}).get("product")
        and (item.properties or {}).get("roadmap_status") not in ("delivered", "cancelled", "deferred")
    ]
    if unlinked_investments:
        gaps.append(
            {
                "type": "gap",
                "severity": "low",
                "title": f"{len(unlinked_investments)} investment{'s' if len(unlinked_investments) != 1 else ''} unlinked",
                "examples": [item.name for item in unlinked_investments[:5]],
                "impact_note": "Won't show on the investment pipeline product rollups.",
                "affected_object_ids": [str(item.id) for item in unlinked_investments],
            }
        )

    return gaps
