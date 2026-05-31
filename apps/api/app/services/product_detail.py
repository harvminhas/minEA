"""Rich Layer-1 detail for the product drawer."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product
from app.services.portfolio_signals import (
    OPEN_DEBT_STATUSES,
    _debt_attached_to_product,
    _debt_attached_to_scope,
    _debt_scope_ids,
    _is_open_debt,
    _normalize_object_id,
)

DEBT_TYPE_LABEL = {
    "eol_software": "EOL software",
    "security_vulnerability": "Security vulnerability",
    "performance_scaling": "Performance / scaling",
    "missing_tests": "Missing tests",
    "outdated_dependency": "Outdated dependency",
    "compliance_gap": "Compliance gap",
    "documentation": "Documentation",
    "architecture_drift": "Architecture drift",
    "vendor_contract": "Vendor / contract",
    "other": "Other",
}

ROADMAP_KIND_LABEL = {
    "feature": "Feature",
    "epic": "Epic",
    "initiative": "Initiative",
    "migration": "Migration",
    "sunset": "Sunset",
    "discovery": "Discovery",
}

ROADMAP_STATUS_LABEL = {
    "discovery": "Discovery",
    "planned": "Planned",
    "in_progress": "In flight",
    "delivered": "Delivered",
    "deferred": "Deferred",
    "cancelled": "Cancelled",
}

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _debt_type_label(props: dict) -> str:
    debt_type = props.get("debt_type") or "other"
    if debt_type == "other" and props.get("debt_type_other"):
        return str(props["debt_type_other"]).strip()
    return DEBT_TYPE_LABEL.get(debt_type, debt_type.replace("_", " ").title())


def _age_days(created_at: datetime) -> int:
    now = datetime.now(timezone.utc)
    created = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    return max(0, (now - created).days)


def compute_health_dimensions(
    product: Product,
    *,
    open_debt: int,
    critical_debt: int,
    maturity_indicator: str | None,
    system_count: int,
) -> dict[str, str]:
    ownership = "critical" if not (product.owner or "").strip() else "healthy"

    if critical_debt > 0:
        debt = "critical"
    elif open_debt > 0:
        debt = "warning"
    else:
        debt = "healthy"

    if product.lifecycle in ("retiring", "retired"):
        lifecycle = "critical"
    elif product.lifecycle in ("planned", "beta"):
        lifecycle = "warning"
    else:
        lifecycle = "healthy"

    if system_count == 0:
        ops = "warning"
    elif maturity_indicator == "manual":
        ops = "warning"
    elif maturity_indicator in ("partial", "outsourced"):
        ops = "warning"
    else:
        ops = "healthy"

    return {"ops": ops, "debt": debt, "lifecycle": lifecycle, "ownership": ownership}


async def _object_owner_map(
    db: AsyncSession, object_ids: set[uuid.UUID], workspace_id: uuid.UUID
) -> dict[str, str | None]:
    if not object_ids:
        return {}
    result = await db.execute(
        select(MinEAObject.id, MinEAObject.owner).where(
            MinEAObject.id.in_(object_ids),
            MinEAObject.workspace_id == workspace_id,
        )
    )
    return {str(row[0]): row[1] for row in result.all()}


async def _debt_remediation_map(
    db: AsyncSession,
    debt_ids: set[uuid.UUID],
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict[str, dict]:
    if not debt_ids:
        return {}

    mapping: dict[str, dict] = {}

    rel_result = await db.execute(
        select(
            Relationship.to_object_id,
            MinEAObject.id,
            MinEAObject.name,
        )
        .join(MinEAObject, MinEAObject.id == Relationship.from_object_id)
        .where(
            Relationship.type == "resolves",
            Relationship.from_type == "roadmap_item",
            Relationship.to_type == "tech_debt",
            Relationship.to_object_id.in_(debt_ids),
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )
    for debt_id, roadmap_id, roadmap_name in rel_result.all():
        mapping[str(debt_id)] = {"roadmap_id": str(roadmap_id), "roadmap_title": roadmap_name}

    # Fallback: resolves_debt on roadmap properties
    roadmap_result = await db.execute(
        select(MinEAObject.id, MinEAObject.name, MinEAObject.properties).where(
            MinEAObject.type == "roadmap_item",
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    for roadmap_id, roadmap_name, props in roadmap_result.all():
        for ref in (props or {}).get("resolves_debt") or []:
            debt_id = ref.get("debt_id")
            if debt_id and debt_id not in mapping:
                mapping[debt_id] = {"roadmap_id": str(roadmap_id), "roadmap_title": roadmap_name}

    return mapping


async def _tech_debt_items_for_product(
    db: AsyncSession,
    product: Product,
    scope_ids: set[uuid.UUID],
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[dict]:
    scope_strs = {_normalize_object_id(sid) for sid in scope_ids}
    scope_strs.discard(None)
    seen: set[uuid.UUID] = set()
    items: list[tuple[int, dict]] = []

    async def add_debt(debt: MinEAObject) -> None:
        if debt.id in seen:
            return
        seen.add(debt.id)
        props = debt.properties or {}
        if not _is_open_debt(props):
            return
        affects = props.get("affects") or {}
        severity = props.get("severity") or "medium"
        rank = SEVERITY_RANK.get(severity, 9)
        items.append(
            (
                rank,
                {
                    "id": str(debt.id),
                    "name": debt.name,
                    "severity": severity,
                    "debt_type": props.get("debt_type"),
                    "debt_type_label": _debt_type_label(props),
                    "age_days": _age_days(debt.created_at),
                    "affects_name": affects.get("object_name") or "Unknown",
                    "affects_kind": affects.get("object_kind") or "application",
                    "identified_by": props.get("identified_by"),
                },
            )
        )

    if scope_ids:
        rel_result = await db.execute(
            select(MinEAObject)
            .join(Relationship, Relationship.from_object_id == MinEAObject.id)
            .where(
                MinEAObject.type == "tech_debt",
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
                Relationship.type == "affects",
                Relationship.from_type == "tech_debt",
                Relationship.to_object_id.in_(scope_ids),
            )
        )
        for debt in rel_result.scalars():
            await add_debt(debt)

    all_debt = await db.execute(
        select(MinEAObject).where(
            MinEAObject.type == "tech_debt",
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )
    for debt in all_debt.scalars():
        if debt.id in seen:
            continue
        props = debt.properties or {}
        if not _debt_attached_to_product(props, product.id) and not _debt_attached_to_scope(
            props, scope_strs
        ):
            continue
        await add_debt(debt)

    items.sort(key=lambda x: x[0])
    debt_ids = {uuid.UUID(item[1]["id"]) for item in items}
    remediation = await _debt_remediation_map(db, debt_ids, workspace_id, org_id)

    affect_uuid_set: set[uuid.UUID] = set()
    debt_by_id: dict[uuid.UUID, MinEAObject] = {}
    if debt_ids:
        for debt in (
            await db.execute(select(MinEAObject).where(MinEAObject.id.in_(debt_ids)))
        ).scalars():
            debt_by_id[debt.id] = debt
            affects = (debt.properties or {}).get("affects") or {}
            oid = _normalize_object_id(affects.get("object_id"))
            if oid:
                try:
                    affect_uuid_set.add(uuid.UUID(oid))
                except ValueError:
                    pass

    owners = await _object_owner_map(db, affect_uuid_set, workspace_id)

    result_items: list[dict] = []
    for _, item in items:
        debt_id = item["id"]
        debt_obj = debt_by_id.get(uuid.UUID(debt_id))
        affects = ((debt_obj.properties if debt_obj else None) or {}).get("affects") or {}
        affect_oid = _normalize_object_id(affects.get("object_id"))
        owner = owners.get(affect_oid or "", None) or item.get("identified_by") or product.owner
        rem = remediation.get(debt_id)
        result_items.append({**item, "owner": owner, "remediation": rem})
    return result_items


def _milestone_strip(milestones: list[dict], limit: int = 4) -> list[dict]:
    ordered = sorted(
        milestones,
        key=lambda m: m.get("target_resolution") or "",
    )[:limit]
    return [{"status": m.get("status", "not_started")} for m in ordered]


def _next_milestone(milestones: list[dict]) -> dict | None:
    ordered = sorted(milestones, key=lambda m: m.get("target_resolution") or "")
    for m in ordered:
        if m.get("status") != "done":
            target = m.get("target_resolution") or ""
            label = target
            if target and "_q" in target:
                parts = target.split("_q")
                if len(parts) == 2:
                    label = f"Q{parts[1]} {parts[0]}"
            return {"title": m.get("title", ""), "target_label": label}
    return None


async def _roadmap_items_for_product(
    db: AsyncSession,
    product: Product,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[dict]:
    pid = str(product.id)
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.type == "roadmap_item",
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
        )
    )

    items: list[dict] = []
    for obj in result.scalars():
        props = obj.properties or {}
        product_ref = props.get("product") or {}
        if product_ref.get("product_id") != pid:
            continue
        milestones = props.get("milestones") or []
        done = sum(1 for m in milestones if m.get("status") == "done")
        target = props.get("target_resolution") or ""
        target_label = target
        if target and "_q" in target:
            y, q = target.split("_q", 1)
            target_label = f"Q{q} {y}"
        elif target == "no_target" or not target:
            target_label = "No target"

        items.append(
            {
                "id": str(obj.id),
                "name": obj.name,
                "kind": props.get("roadmap_kind"),
                "kind_label": ROADMAP_KIND_LABEL.get(props.get("roadmap_kind") or "", "Item"),
                "status": props.get("roadmap_status") or "discovery",
                "status_label": ROADMAP_STATUS_LABEL.get(
                    props.get("roadmap_status") or "discovery", "Discovery"
                ),
                "target_label": target_label,
                "owner": obj.owner,
                "milestone_strip": _milestone_strip(milestones),
                "milestones_done": done,
                "milestones_total": len(milestones),
                "next_milestone": _next_milestone(milestones),
            }
        )

    priority = {"in_progress": 0, "planned": 1, "discovery": 2, "deferred": 3, "delivered": 4, "cancelled": 5}
    items.sort(key=lambda i: priority.get(i["status"], 9))
    return items


async def enrich_product_detail(
    db: AsyncSession,
    product: Product,
    *,
    open_debt: int,
    critical_debt: int,
    maturity_indicator: str | None,
    system_count: int,
) -> dict:
    ws_id = product.workspace_id
    org_id = product.org_id
    scope_ids = await _debt_scope_ids(db, product.id, ws_id, org_id)

    return {
        "health_dimensions": compute_health_dimensions(
            product,
            open_debt=open_debt,
            critical_debt=critical_debt,
            maturity_indicator=maturity_indicator,
            system_count=system_count,
        ),
        "tech_debt_items": await _tech_debt_items_for_product(db, product, scope_ids, ws_id, org_id),
        "roadmap_items": await _roadmap_items_for_product(db, product, ws_id, org_id),
    }
