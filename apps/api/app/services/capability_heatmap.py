"""Capability × product heatmap — fitness in each realising cell."""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product, ProductSystemOverride, Realization, RealizationSystem
from app.services.capability_map import load_capability_map
from app.services.product_scope import SYSTEM_TYPES

VALID_FITNESS = frozenset({"none", "weak", "adequate", "strong"})
EOL_STATUSES = frozenset({"retiring", "retired"})

PRODUCT_COLORS = [
    "#6366f1",
    "#f97316",
    "#ef4444",
    "#166534",
    "#0ea5e9",
    "#6b7280",
]


def _normalize_fitness(value: object | None) -> str:
    if isinstance(value, str) and value in VALID_FITNESS and value != "none":
        return value
    return "adequate"


def _fitness_to_level(fitnesses: list[str]) -> str:
    if not fitnesses:
        return "gap"
    if any(f == "weak" for f in fitnesses):
        return "poor"
    if all(f == "strong" for f in fitnesses):
        return "strong"
    if any(f == "strong" for f in fitnesses):
        return "good"
    return "fair"


def _product_short_code(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        return (parts[0][:1] + parts[1][:1]).upper()
    return name[:2].upper()


def _product_abbrev(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        return parts[0][:6]
    return name[:8]


async def _bulk_product_system_scopes(
    db: AsyncSession,
    products: list[Product],
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict[str, set[str]]:
    if not products:
        return {}

    product_cap_ids: dict[uuid.UUID, set[uuid.UUID]] = {}
    all_cap_ids: set[uuid.UUID] = set()
    for product in products:
        caps = {pc.capability_id for pc in product.capabilities}
        product_cap_ids[product.id] = caps
        all_cap_ids |= caps

    cap_realization_systems: dict[str, set[str]] = defaultdict(set)
    if all_cap_ids:
        real_result = await db.execute(
            select(Realization.capability_id, RealizationSystem.system_id)
            .join(RealizationSystem, RealizationSystem.realization_id == Realization.id)
            .where(
                Realization.capability_id.in_(all_cap_ids),
                Realization.workspace_id == workspace_id,
                Realization.org_id == org_id,
            )
        )
        for cap_id, sys_id in real_result.all():
            cap_realization_systems[str(cap_id)].add(str(sys_id))

    supported_targets_by_cap: dict[str, set[str]] = defaultdict(set)
    if all_cap_ids:
        supported_result = await db.execute(
            select(Relationship.from_object_id, Relationship.to_object_id).where(
                Relationship.type == "supported_by",
                Relationship.from_type == "capability",
                Relationship.from_object_id.in_(all_cap_ids),
                Relationship.to_type.in_(SYSTEM_TYPES),
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
            )
        )
        for cap_id, sys_id in supported_result.all():
            supported_targets_by_cap[str(cap_id)].add(str(sys_id))

    override_result = await db.execute(
        select(ProductSystemOverride.product_id, ProductSystemOverride.system_id).where(
            ProductSystemOverride.product_id.in_([p.id for p in products])
        )
    )
    overrides_by_product: dict[str, set[str]] = defaultdict(set)
    for pid, sid in override_result.all():
        overrides_by_product[str(pid)].add(str(sid))

    scopes: dict[str, set[str]] = {}
    for product in products:
        pid = str(product.id)
        scope: set[str] = set(overrides_by_product.get(pid, set()))
        for cap_id in product_cap_ids.get(product.id, set()):
            cid = str(cap_id)
            scope |= cap_realization_systems.get(cid, set())
            scope |= supported_targets_by_cap.get(cid, set())
        scopes[pid] = scope
    return scopes


async def build_capability_heatmap(
    db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> dict:
    products_result = await db.execute(
        select(Product)
        .options(selectinload(Product.capabilities))
        .where(Product.workspace_id == workspace_id, Product.org_id == org_id)
        .order_by(Product.name)
    )
    products = list(products_result.scalars().all())

    domains_raw, capabilities_raw = await load_capability_map(db, workspace_id, org_id)
    cap_by_id = {str(c.id): c for c in capabilities_raw}
    cap_ids = list(cap_by_id.keys())

    supported_by: dict[str, list[tuple[str, str]]] = defaultdict(list)
    if cap_ids:
        cap_uuids = [uuid.UUID(cid) for cid in cap_ids]
        rel_result = await db.execute(
            select(
                Relationship.from_object_id,
                Relationship.to_object_id,
                Relationship.attributes,
            ).where(
                Relationship.type == "supported_by",
                Relationship.from_type == "capability",
                Relationship.from_object_id.in_(cap_uuids),
                Relationship.to_type.in_(SYSTEM_TYPES),
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
            )
        )
        for cap_id, sys_id, attrs in rel_result.all():
            fitness = _normalize_fitness((attrs or {}).get("fitness"))
            supported_by[str(cap_id)].append((str(sys_id), fitness))

    cap_realization_systems: dict[str, set[str]] = defaultdict(set)
    if cap_ids:
        real_result = await db.execute(
            select(Realization.capability_id, RealizationSystem.system_id)
            .join(RealizationSystem, RealizationSystem.realization_id == Realization.id)
            .where(
                Realization.capability_id.in_([uuid.UUID(c) for c in cap_ids]),
                Realization.workspace_id == workspace_id,
                Realization.org_id == org_id,
            )
        )
        for cap_id, sys_id in real_result.all():
            cap_realization_systems[str(cap_id)].add(str(sys_id))

    system_status: dict[str, str | None] = {}
    all_system_ids: set[str] = set()
    for rels in supported_by.values():
        for sid, _ in rels:
            all_system_ids.add(sid)
    for systems in cap_realization_systems.values():
        all_system_ids |= systems

    if all_system_ids:
        sys_result = await db.execute(
            select(MinEAObject.id, MinEAObject.status).where(
                MinEAObject.id.in_([uuid.UUID(s) for s in all_system_ids]),
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
            )
        )
        system_status = {str(row[0]): row[1] for row in sys_result.all()}

    product_scopes = await _bulk_product_system_scopes(db, products, workspace_id, org_id)

    product_reads = []
    for i, product in enumerate(products):
        product_reads.append(
            {
                "id": str(product.id),
                "name": product.name,
                "short_code": _product_short_code(product.name),
                "abbrev": _product_abbrev(product.name),
                "lifecycle": product.lifecycle,
                "color": PRODUCT_COLORS[i % len(PRODUCT_COLORS)],
                "capability_ids": [str(pc.capability_id) for pc in product.capabilities],
            }
        )

    product_cap_sets = {p["id"]: set(p["capability_ids"]) for p in product_reads}

    def cell_for(product_id: str, cap_id: str, realising_count: int) -> dict:
        if cap_id not in product_cap_sets.get(product_id, set()):
            return {"level": "empty", "label": "—"}

        scope = product_scopes.get(product_id, set())
        cap_rels = supported_by.get(cap_id, [])
        relevant_systems = cap_realization_systems.get(cap_id, set()) | {
            sid for sid, _ in cap_rels if sid in scope
        }
        relevant_fitness = [
            fit for sid, fit in cap_rels if sid in relevant_systems and sid in scope
        ]

        if not relevant_fitness:
            if relevant_systems & scope:
                relevant_fitness = [
                    fit for sid, fit in cap_rels if sid in relevant_systems
                ]
            if not relevant_fitness:
                if realising_count > 1:
                    return {"level": "unrated", "label": "— unrated"}
                return {"level": "gap", "label": "— gap"}

        if any(system_status.get(sid) in EOL_STATUSES for sid in relevant_systems if sid in scope):
            return {"level": "eol", "label": "● EOL"}

        level = _fitness_to_level(relevant_fitness)
        fitness_labels = {
            "strong": "● Strong",
            "good": "● Good",
            "fair": "● Fair",
            "poor": "● Poor",
        }
        return {"level": level, "label": fitness_labels.get(level, level)}

    domain_reads = []
    all_cap_rows: list[dict] = []

    caps_by_domain: dict[str, list] = defaultdict(list)
    for cap in capabilities_raw:
        domain_id = str((cap.properties or {}).get("domain_id", ""))
        if domain_id:
            caps_by_domain[domain_id].append(cap)

    for domain in domains_raw:
        props = domain.properties or {}
        cap_rows = []
        for cap in sorted(
            caps_by_domain.get(str(domain.id), []),
            key=lambda c: ((c.properties or {}).get("order_index") or 999, c.name),
        ):
            cid = str(cap.id)
            realising_count = sum(
                1 for p in product_reads if cid in product_cap_sets.get(p["id"], set())
            )
            cells = {
                p["id"]: cell_for(p["id"], cid, realising_count) for p in product_reads
            }
            row = {
                "id": cid,
                "name": cap.name,
                "status": cap.status,
                "is_planned": cap.status == "planned",
                "cells": cells,
                "overlap": realising_count > 1,
                "realising_count": realising_count,
                "domain_name": domain.name,
            }
            cap_rows.append(row)
            all_cap_rows.append({**row, "domain_name": domain.name})

        domain_reads.append(
            {
                "id": str(domain.id),
                "name": domain.name,
                "icon": props.get("icon"),
                "capabilities": cap_rows,
            }
        )

    gap_caps = [r for r in all_cap_rows if r["realising_count"] == 0]
    overlap_caps = [r for r in all_cap_rows if r["overlap"]]

    hot_spots: list[dict] = []
    for row in all_cap_rows:
        levels = [row["cells"][p["id"]]["level"] for p in product_reads if row["cells"][p["id"]]["level"] != "empty"]
        if "eol" in levels and any(l in ("fair", "poor") for l in levels):
            eol_products = [
                p["abbrev"]
                for p in product_reads
                if row["cells"][p["id"]]["level"] == "eol"
            ]
            weak_products = [
                p["abbrev"]
                for p in product_reads
                if row["cells"][p["id"]]["level"] in ("fair", "poor")
            ]
            hot_spots.append(
                {
                    "capability_name": row["name"],
                    "detail": f"EOL in {' · '.join(eol_products)} · {weak_products[0] if weak_products else 'fair'} in others",
                }
            )

    return {
        "products": product_reads,
        "domains": domain_reads,
        "summary": {
            "capability_count": len(all_cap_rows),
            "product_count": len(product_reads),
            "gap_count": len(gap_caps),
            "overlap_count": len(overlap_caps),
            "gaps": [
                {
                    "capability_name": r["name"],
                    "domain_name": r["domain_name"],
                    "detail": "no realising product",
                }
                for r in gap_caps[:5]
            ],
            "overlaps": {
                "count": len(overlap_caps),
                "names": [r["name"] for r in overlap_caps],
            },
            "hot_spots": hot_spots[:5],
        },
    }
