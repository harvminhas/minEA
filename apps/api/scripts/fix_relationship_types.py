"""Dry-run by default. Pass --apply to write one transaction. Do not use --apply on production.

Exact duplicates are deleted, keeping the earliest row by (created_at, id).
Migration 045 does that delete, then creates uq_relationships_ends.
"""

from __future__ import annotations

import asyncio
import sys
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.orm.attributes import flag_modified

from app.database import AsyncSessionLocal
from app.models.objects import ChangeLog, MinEAObject, Workspace
from app.models.relationships import Relationship
from app.models.tenancy import Org
from app.services.catalog_cache import mark_catalog_dirty
from app.services.relationship_type_fix import (
    FixAction,
    FixEdge,
    PartyRef,
    VendorBackfill,
    VendorText,
    VENDOR_TEXT_TYPES,
    apply_actions,
    plan_fixes,
    plan_vendor_backfill,
)
from app.services.relationship_write import save_relationship, with_vendor_name


async def load_edges() -> list[FixEdge]:
    source = aliased(MinEAObject)
    target = aliased(MinEAObject)
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(
                    Relationship,
                    Org.slug,
                    Workspace.slug,
                    source.name,
                    target.name,
                    source.properties,
                )
                .join(Workspace, Workspace.id == Relationship.workspace_id)
                .join(Org, Org.id == Relationship.org_id)
                .join(source, source.id == Relationship.from_object_id)
                .join(target, target.id == Relationship.to_object_id)
            )
        ).all()
    edges: list[FixEdge] = []
    for rel, org_slug, ws_slug, from_name, to_name, properties in rows:
        edges.append(
            FixEdge(
                id=str(rel.id),
                org_id=str(rel.org_id),
                workspace_id=str(rel.workspace_id),
                org_slug=org_slug,
                ws_slug=ws_slug,
                type=rel.type,
                from_id=str(rel.from_object_id),
                from_type=rel.from_type,
                from_name=from_name,
                to_id=str(rel.to_object_id),
                to_type=rel.to_type,
                to_name=to_name,
                created_at=rel.created_at,
                from_vendor=_vendor_text(properties),
            )
        )
    return edges


def _vendor_text(properties: object) -> str:
    if not isinstance(properties, dict):
        return ""
    vendor = properties.get("vendor")
    return vendor.strip() if isinstance(vendor, str) else ""


async def load_vendor_rows() -> tuple[list[VendorText], list[PartyRef]]:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(MinEAObject, Org.slug, Workspace.slug)
                .join(Workspace, Workspace.id == MinEAObject.workspace_id)
                .join(Org, Org.id == MinEAObject.org_id)
                .where(MinEAObject.type.in_([*VENDOR_TEXT_TYPES, "external_party"]))
            )
        ).all()
    records: list[VendorText] = []
    parties: list[PartyRef] = []
    for obj, org_slug, ws_slug in rows:
        if obj.type == "external_party":
            parties.append(PartyRef(id=str(obj.id), workspace_id=str(obj.workspace_id), name=obj.name))
            continue
        vendor = _vendor_text(obj.properties)
        if not vendor:
            continue
        records.append(
            VendorText(
                id=str(obj.id),
                org_id=str(obj.org_id),
                workspace_id=str(obj.workspace_id),
                org_slug=org_slug,
                ws_slug=ws_slug,
                type=obj.type,
                name=obj.name,
                vendor=vendor,
            )
        )
    return records, parties


async def persist(edges: list[FixEdge], actions: list[FixAction]) -> None:
    updated, logs = apply_actions(edges, actions)
    by_id = {edge.id: edge for edge in updated}
    async with AsyncSessionLocal() as db:
        async with db.begin():
            touched: set[UUID] = set()
            for action in actions:
                if action.kind == "report":
                    continue
                rel = await db.get(Relationship, UUID(action.edge_id))
                if rel is None:
                    continue
                if action.kind == "delete":
                    await db.delete(rel)
                    touched.add(rel.workspace_id)
                    continue
                nxt = by_id[action.edge_id]
                rel.type = nxt.type
                rel.from_object_id = UUID(nxt.from_id)
                rel.from_type = nxt.from_type
                rel.to_object_id = UUID(nxt.to_id)
                rel.to_type = nxt.to_type
                touched.add(rel.workspace_id)
                if action.vendor_name:
                    source = await db.get(MinEAObject, UUID(nxt.from_id))
                    if source is not None:
                        source.properties = with_vendor_name(source.properties, action.vendor_name)
                        flag_modified(source, "properties")
            for workspace_id in touched:
                await mark_catalog_dirty(db, workspace_id)
            for entry in logs:
                db.add(
                    ChangeLog(
                        workspace_id=UUID(entry["workspace_id"]),
                        org_id=UUID(entry["org_id"]),
                        object_id=UUID(entry["object_id"]),
                        object_type=entry["object_type"],
                        action=entry["action"],
                        diff=entry["diff"],
                    )
                )


async def persist_vendor_backfill(plans: list[VendorBackfill]) -> None:
    if not plans:
        return
    async with AsyncSessionLocal() as db:
        async with db.begin():
            for plan in plans:
                party_id = UUID(plan.party_id) if plan.party_id else None
                if party_id is None:
                    found = (
                        await db.execute(
                            select(MinEAObject)
                            .where(
                                MinEAObject.workspace_id == UUID(plan.workspace_id),
                                MinEAObject.type == "external_party",
                                func.lower(MinEAObject.name) == plan.vendor_name.lower(),
                            )
                            .order_by(MinEAObject.created_at, MinEAObject.id)
                        )
                    ).scalars().first()
                    if found is None:
                        found = MinEAObject(
                            workspace_id=UUID(plan.workspace_id),
                            org_id=UUID(plan.org_id),
                            type="external_party",
                            name=plan.vendor_name,
                            properties={},
                            tags=[],
                            source="user",
                        )
                        db.add(found)
                        await db.flush()
                    party_id = found.id
                await save_relationship(
                    db,
                    Relationship(
                        workspace_id=UUID(plan.workspace_id),
                        org_id=UUID(plan.org_id),
                        type="supplied_by",
                        from_object_id=UUID(plan.object_id),
                        from_type=plan.object_type,
                        to_object_id=party_id,
                        to_type="external_party",
                        attributes={},
                    ),
                )
            for workspace_id in {UUID(plan.workspace_id) for plan in plans}:
                await mark_catalog_dirty(db, workspace_id)


async def main() -> None:
    apply = "--apply" in sys.argv
    edges = await load_edges()
    actions = plan_fixes(edges)
    records, parties = await load_vendor_rows()
    planned, _logs = apply_actions(edges, actions)
    backfills = plan_vendor_backfill(records, planned, parties)
    for action in actions:
        print(action.line)
    for plan in backfills:
        print(plan.line)
    changes = [action for action in actions if action.kind != "report"]
    reports = len(actions) - len(changes)
    total = len(changes) + len(backfills)
    print(f"{total} changes, {reports} reports")
    if not apply:
        return
    await persist(edges, actions)
    await persist_vendor_backfill(backfills)
    print(f"applied {total} changes")


if __name__ == "__main__":
    asyncio.run(main())
