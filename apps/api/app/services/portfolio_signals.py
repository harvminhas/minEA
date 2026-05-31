"""Layer-1 portfolio signals for product cockpit cards."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.models.views_graph import Product, ProductCapability, ProductSystemOverride, Realization, RealizationSystem

OPEN_DEBT_STATUSES = {"open", "in_progress", "deferred"}
CRITICAL_SEVERITIES = {"critical", "high"}
ROADMAP_ACTIVE = {"discovery", "planned", "in_progress"}
SYSTEM_TYPES = ("application", "solution", "technical_capability")


def _normalize_object_id(value: object | None) -> str | None:
    if value is None:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return str(value)


async def _capability_ids_for_product(db: AsyncSession, product_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(ProductCapability.capability_id).where(ProductCapability.product_id == product_id)
    )
    return [row[0] for row in result.all()]


async def _system_ids_for_product(
    db: AsyncSession,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> set[uuid.UUID]:
    """Systems linked to a product via capabilities (realizations + supported_by)."""
    cap_ids = await _capability_ids_for_product(db, product_id)
    system_ids: set[uuid.UUID] = set()

    if cap_ids:
        via_realization = await db.execute(
            select(distinct(RealizationSystem.system_id))
            .select_from(ProductCapability)
            .join(Realization, Realization.capability_id == ProductCapability.capability_id)
            .join(RealizationSystem, RealizationSystem.realization_id == Realization.id)
            .where(ProductCapability.product_id == product_id)
        )
        system_ids |= {row[0] for row in via_realization.all()}

        # supported_by: capability → system (canonical triple direction)
        via_supported = await db.execute(
            select(distinct(Relationship.to_object_id)).where(
                Relationship.type == "supported_by",
                Relationship.from_type == "capability",
                Relationship.from_object_id.in_(cap_ids),
                Relationship.to_type.in_(SYSTEM_TYPES),
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
            )
        )
        system_ids |= {row[0] for row in via_supported.all()}

    override_result = await db.execute(
        select(ProductSystemOverride.system_id).where(ProductSystemOverride.product_id == product_id)
    )
    system_ids |= {row[0] for row in override_result.all()}
    return system_ids


async def _component_ids_for_systems(
    db: AsyncSession,
    system_ids: set[uuid.UUID],
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> set[uuid.UUID]:
    """Components that belong to any of the product's systems."""
    if not system_ids:
        return set()

    result = await db.execute(
        select(distinct(Relationship.from_object_id)).where(
            Relationship.type == "part_of",
            Relationship.from_type == "component",
            Relationship.to_type == "application",
            Relationship.to_object_id.in_(system_ids),
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
        )
    )
    return {row[0] for row in result.all()}


async def _debt_scope_ids(
    db: AsyncSession,
    product_id: uuid.UUID,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> set[uuid.UUID]:
    """Object ids (systems + components) whose tech debt rolls up to this product."""
    system_ids = await _system_ids_for_product(db, product_id, workspace_id, org_id)
    component_ids = await _component_ids_for_systems(db, system_ids, workspace_id, org_id)
    return system_ids | component_ids


def _is_open_debt(props: dict | None) -> bool:
    if not props:
        return False
    status = props.get("debt_status") or "open"
    return status in OPEN_DEBT_STATUSES


def _count_debt_item(
    props: dict | None,
    updated_at: datetime,
    *,
    open_count: int,
    critical_count: int,
    latest: datetime | None,
) -> tuple[int, int, datetime | None]:
    if not _is_open_debt(props):
        return open_count, critical_count, latest
    open_count += 1
    severity = (props or {}).get("severity") or "medium"
    if severity in CRITICAL_SEVERITIES:
        critical_count += 1
    if latest is None or updated_at > latest:
        latest = updated_at
    return open_count, critical_count, latest


async def _annual_cost_for_product(
    db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> float:
    system_ids = await _system_ids_for_product(db, product_id, workspace_id, org_id)
    if not system_ids:
        return 0.0

    result = await db.execute(
        select(MinEAObject.properties).where(
            MinEAObject.id.in_(system_ids),
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.type.in_(SYSTEM_TYPES),
        )
    )
    total = 0.0
    for (props,) in result.all():
        if not props:
            continue
        raw = props.get("annual_cost")
        if raw is None:
            continue
        try:
            total += float(raw)
        except (TypeError, ValueError):
            continue
    return total


def _debt_attached_to_product(props: dict | None, product_id: uuid.UUID) -> bool:
    if not props:
        return False
    affects = props.get("affects") or {}
    if affects.get("object_kind") != "product":
        return False
    return _normalize_object_id(affects.get("object_id")) == str(product_id)


def _debt_attached_to_scope(
    props: dict | None, scope_strs: set[str | None]
) -> bool:
    if not props or not scope_strs:
        return False
    affects = props.get("affects") or {}
    obj_id = _normalize_object_id(affects.get("object_id"))
    kind = affects.get("object_kind")
    return obj_id in scope_strs and kind in ("application", "component", None)


async def _tech_debt_for_product(
    db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> tuple[int, int, datetime | None]:
    scope_ids = await _debt_scope_ids(db, product_id, workspace_id, org_id)
    scope_strs = {_normalize_object_id(sid) for sid in scope_ids}
    scope_strs.discard(None)

    seen_debt_ids: set[uuid.UUID] = set()
    open_count = 0
    critical_count = 0
    latest: datetime | None = None

    # Primary: relationship graph (tech_debt --affects--> system|component)
    if scope_ids:
        rel_result = await db.execute(
            select(MinEAObject.id, MinEAObject.properties, MinEAObject.updated_at)
            .join(Relationship, Relationship.from_object_id == MinEAObject.id)
            .where(
                MinEAObject.type == "tech_debt",
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
                Relationship.type == "affects",
                Relationship.from_type == "tech_debt",
                Relationship.to_type.in_(("application", "component")),
                Relationship.to_object_id.in_(scope_ids),
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
            )
        )
        for debt_id, props, updated_at in rel_result.all():
            if debt_id in seen_debt_ids:
                continue
            seen_debt_ids.add(debt_id)
            open_count, critical_count, latest = _count_debt_item(
                props, updated_at,
                open_count=open_count, critical_count=critical_count, latest=latest,
            )

    # Fallback: properties.affects for records not synced to relationships
    prop_result = await db.execute(
        select(MinEAObject.id, MinEAObject.properties, MinEAObject.updated_at).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "tech_debt",
        )
    )
    for debt_id, props, updated_at in prop_result.all():
        if debt_id in seen_debt_ids:
            continue
        if not _debt_attached_to_product(props, product_id) and not _debt_attached_to_scope(
            props, scope_strs
        ):
            continue
        seen_debt_ids.add(debt_id)
        open_count, critical_count, latest = _count_debt_item(
            props, updated_at,
            open_count=open_count, critical_count=critical_count, latest=latest,
        )

    return open_count, critical_count, latest


async def _roadmap_for_product(
    db: AsyncSession, product_id: uuid.UUID, workspace_id: uuid.UUID, org_id: uuid.UUID
) -> tuple[str | None, int, datetime | None]:
    pid = str(product_id)
    result = await db.execute(
        select(MinEAObject.properties, MinEAObject.updated_at).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "roadmap_item",
        )
    )

    statuses: list[str] = []
    latest: datetime | None = None
    count = 0

    for props, updated_at in result.all():
        if not props:
            continue
        product_ref = props.get("product") or {}
        if product_ref.get("product_id") != pid:
            continue
        count += 1
        status = props.get("roadmap_status") or "discovery"
        statuses.append(status)
        if latest is None or updated_at > latest:
            latest = updated_at

    if not statuses:
        return None, 0, None

    priority = ["in_progress", "planned", "discovery", "deferred", "delivered", "cancelled"]
    primary = min(statuses, key=lambda s: priority.index(s) if s in priority else 99)
    return primary, count, latest


def _health_factors(
    *,
    lifecycle: str,
    owner: str | None,
    capability_count: int,
    maturity_indicator: str | None,
    open_debt: int,
    critical_debt: int,
    roadmap_status: str | None,
) -> list[dict]:
    factors: list[dict] = []

    if not owner or not owner.strip():
        factors.append(
            {"id": "ownership", "label": "No owner assigned", "severity": "critical", "action": "Assign a team"}
        )
    elif capability_count == 0:
        factors.append(
            {
                "id": "mapping",
                "label": "No capabilities mapped",
                "severity": "warning",
                "action": "Map capabilities in Repository",
            }
        )

    if lifecycle in ("retiring", "retired"):
        factors.append(
            {
                "id": "lifecycle",
                "label": f"Lifecycle is {lifecycle}",
                "severity": "warning" if lifecycle == "retiring" else "info",
                "action": "Review sunset plan",
            }
        )

    if maturity_indicator == "manual" and capability_count > 0:
        factors.append(
            {
                "id": "maturity",
                "label": "Manual realization maturity",
                "severity": "warning",
                "action": "Review automation gaps",
            }
        )

    if critical_debt > 0:
        factors.append(
            {
                "id": "debt_critical",
                "label": f"{critical_debt} critical/high debt item{'s' if critical_debt != 1 else ''}",
                "severity": "critical",
                "action": "Review tech debt register",
            }
        )
    elif open_debt > 0:
        factors.append(
            {
                "id": "debt",
                "label": f"{open_debt} open debt item{'s' if open_debt != 1 else ''}",
                "severity": "warning",
                "action": "Prioritize remediation",
            }
        )

    if roadmap_status in ROADMAP_ACTIVE:
        factors.append(
            {
                "id": "roadmap",
                "label": f"Roadmap {roadmap_status.replace('_', ' ')}",
                "severity": "info",
                "action": "View roadmap timeline",
            }
        )
    elif open_debt > 0 and not roadmap_status:
        factors.append(
            {
                "id": "no_roadmap",
                "label": "Debt with no roadmap item",
                "severity": "warning",
                "action": "Create roadmap item",
            }
        )

    if not factors:
        factors.append(
            {"id": "healthy", "label": "No open issues detected", "severity": "ok", "action": "Monitor"}
        )

    return factors


def _health_status(factors: list[dict]) -> str:
    severities = {f["severity"] for f in factors}
    if "critical" in severities:
        return "at_risk"
    if "warning" in severities:
        return "aging"
    if any(f["id"] == "mapping" for f in factors):
        return "no_data"
    return "healthy"


def _trend_summary(
    *,
    product_updated: datetime,
    debt_latest: datetime | None,
    roadmap_latest: datetime | None,
    open_debt: int,
    roadmap_count: int,
) -> dict:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=14)

    def aware(dt: datetime) -> datetime:
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    events: list[tuple[datetime, str, str]] = []
    if debt_latest and aware(debt_latest) >= cutoff:
        events.append((aware(debt_latest), "debt", f"{open_debt} open debt item{'s' if open_debt != 1 else ''}"))
    if roadmap_latest and aware(roadmap_latest) >= cutoff:
        events.append(
            (
                aware(roadmap_latest),
                "roadmap",
                f"{roadmap_count} roadmap item{'s' if roadmap_count != 1 else ''} active",
            )
        )
    if aware(product_updated) >= cutoff:
        events.append((aware(product_updated), "product", "Product record updated"))

    if not events:
        return {"direction": "stable", "label": "No recent changes"}

    events.sort(key=lambda e: e[0], reverse=True)
    latest = events[0]
    direction = "up" if latest[1] == "debt" else "down" if latest[1] == "roadmap" else "neutral"
    return {"direction": direction, "label": latest[2]}


async def enrich_portfolio_signals(
    db: AsyncSession,
    product: Product,
    *,
    capability_count: int,
    maturity_indicator: str | None,
) -> dict:
    # Snapshot ORM columns before any await — expired instances trigger async lazy-load errors.
    ws_id = product.workspace_id
    org_id = product.org_id
    pid = product.id
    lifecycle = product.lifecycle
    owner = product.owner
    updated_at = product.updated_at

    annual_cost = await _annual_cost_for_product(db, pid, ws_id, org_id)
    open_debt, critical_debt, debt_latest = await _tech_debt_for_product(db, pid, ws_id, org_id)
    roadmap_status, roadmap_count, roadmap_latest = await _roadmap_for_product(db, pid, ws_id, org_id)

    factors = _health_factors(
        lifecycle=lifecycle,
        owner=owner,
        capability_count=capability_count,
        maturity_indicator=maturity_indicator,
        open_debt=open_debt,
        critical_debt=critical_debt,
        roadmap_status=roadmap_status,
    )
    health_status = _health_status(factors)
    trend = _trend_summary(
        product_updated=updated_at,
        debt_latest=debt_latest,
        roadmap_latest=roadmap_latest,
        open_debt=open_debt,
        roadmap_count=roadmap_count,
    )

    return {
        "annual_cost_total": annual_cost if annual_cost > 0 else None,
        "open_tech_debt_count": open_debt,
        "critical_tech_debt_count": critical_debt,
        "roadmap_status": roadmap_status,
        "roadmap_count": roadmap_count,
        "health_status": health_status,
        "health_factors": factors,
        "trend_direction": trend["direction"],
        "trend_label": trend["label"],
    }
