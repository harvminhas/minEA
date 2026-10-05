"""Dry-run by default. Pass --apply to write one transaction. Do not use --apply on production."""

from __future__ import annotations

import asyncio
import sys
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.database import AsyncSessionLocal
from app.models.objects import ChangeLog, MinEAObject, Workspace
from app.models.relationships import Relationship
from app.models.tenancy import Org
from app.services.relationship_type_fix import FixAction, FixEdge, apply_actions, plan_fixes


async def load_edges() -> list[FixEdge]:
    source = aliased(MinEAObject)
    target = aliased(MinEAObject)
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Relationship, Org.slug, Workspace.slug, source.name, target.name)
                .join(Workspace, Workspace.id == Relationship.workspace_id)
                .join(Org, Org.id == Relationship.org_id)
                .join(source, source.id == Relationship.from_object_id)
                .join(target, target.id == Relationship.to_object_id)
            )
        ).all()
    edges: list[FixEdge] = []
    for rel, org_slug, ws_slug, from_name, to_name in rows:
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
            )
        )
    return edges


async def persist(edges: list[FixEdge], actions: list[FixAction]) -> None:
    updated, logs = apply_actions(edges, actions)
    by_id = {edge.id: edge for edge in updated}
    async with AsyncSessionLocal() as db:
        async with db.begin():
            for action in actions:
                if action.kind == "report":
                    continue
                rel = await db.get(Relationship, UUID(action.edge_id))
                if rel is None:
                    continue
                if action.kind == "delete":
                    await db.delete(rel)
                    continue
                nxt = by_id[action.edge_id]
                rel.type = nxt.type
                rel.from_object_id = UUID(nxt.from_id)
                rel.from_type = nxt.from_type
                rel.to_object_id = UUID(nxt.to_id)
                rel.to_type = nxt.to_type
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


async def main() -> None:
    apply = "--apply" in sys.argv
    edges = await load_edges()
    actions = plan_fixes(edges)
    for action in actions:
        print(action.line)
    changes = [action for action in actions if action.kind != "report"]
    reports = len(actions) - len(changes)
    print(f"{len(changes)} changes, {reports} reports")
    if not apply:
        return
    await persist(edges, actions)
    print(f"applied {len(changes)} changes")


if __name__ == "__main__":
    asyncio.run(main())
