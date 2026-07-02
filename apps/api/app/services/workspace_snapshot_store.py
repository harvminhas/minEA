"""Postgres JSONB workspace snapshot — stale-while-revalidate read model."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.workspace_snapshot import WorkspaceSnapshot
from app.schemas.workspace_summary import WorkspaceSnapshotResponse, WorkspaceSummaryRead
from app.services.workspace_summary import fetch_workspace_summary
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

DEBOUNCE_SECONDS = 0.45
_pending_tasks: dict[UUID, asyncio.Task[None]] = {}


def _utc_now() -> datetime:
    return utc_now()


async def _set_rls_org(db: AsyncSession, org_id: UUID) -> None:
    """Tenant scope for background jobs (RLS on objects / view tables)."""
    await db.execute(
        text("SELECT set_config('app.org_id', :org_id, true)"),
        {"org_id": str(org_id)},
    )


def _is_rebuild_pending(workspace_id: UUID) -> bool:
    task = _pending_tasks.get(workspace_id)
    return task is not None and not task.done()


async def _get_or_create_row(
    db: AsyncSession, workspace_id: UUID, org_id: UUID
) -> WorkspaceSnapshot:
    result = await db.execute(
        select(WorkspaceSnapshot).where(WorkspaceSnapshot.workspace_id == workspace_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = WorkspaceSnapshot(
            workspace_id=workspace_id,
            org_id=org_id,
            version=0,
            payload={},
            dirty=True,
            rebuilding=False,
            dirty_at=_utc_now(),
        )
        db.add(row)
        await db.flush()
    return row


async def mark_snapshot_dirty(db: AsyncSession, workspace_id: UUID, org_id: UUID) -> None:
    row = await _get_or_create_row(db, workspace_id, org_id)
    row.dirty = True
    row.dirty_at = _utc_now()
    row.org_id = org_id


def schedule_snapshot_rebuild(
    workspace_id: UUID, org_id: UUID, *, immediate: bool = False
) -> None:
    """Debounced background rebuild — never cancels an in-flight rebuild."""
    if _is_rebuild_pending(workspace_id):
        return

    delay = 0.0 if immediate else DEBOUNCE_SECONDS

    async def _run() -> None:
        try:
            if delay > 0:
                await asyncio.sleep(delay)
            await rebuild_snapshot_now(workspace_id, org_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("workspace snapshot rebuild failed workspace_id=%s", workspace_id)
        finally:
            _pending_tasks.pop(workspace_id, None)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    _pending_tasks[workspace_id] = loop.create_task(_run())


async def rebuild_snapshot_now(workspace_id: UUID, org_id: UUID) -> None:
    """Rebuild snapshot in isolated sessions (never share the request-scoped session)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WorkspaceSnapshot).where(WorkspaceSnapshot.workspace_id == workspace_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = WorkspaceSnapshot(
                workspace_id=workspace_id,
                org_id=org_id,
                version=0,
                payload={},
                dirty=True,
                rebuilding=True,
                dirty_at=_utc_now(),
            )
            db.add(row)
        else:
            row.rebuilding = True
            row.org_id = org_id
        await db.commit()

    try:
        async with AsyncSessionLocal() as db:
            await _set_rls_org(db, org_id)
            summary = await fetch_workspace_summary(db, workspace_id, org_id)
            payload = summary.model_dump(mode="json")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(WorkspaceSnapshot).where(WorkspaceSnapshot.workspace_id == workspace_id)
            )
            row = result.scalar_one()
            row.payload = payload
            row.version = row.version + 1
            row.built_at = _utc_now()
            row.dirty = False
            row.rebuilding = False
            row.dirty_at = None
            await db.commit()
    except Exception:
        logger.exception("workspace snapshot rebuild failed workspace_id=%s", workspace_id)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(WorkspaceSnapshot).where(WorkspaceSnapshot.workspace_id == workspace_id)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                row.rebuilding = False
                row.dirty = True
                await db.commit()
        raise


def _has_built_snapshot(row: WorkspaceSnapshot) -> bool:
    return row.version > 0 and bool(row.payload)


def _metrics_from_row(row: WorkspaceSnapshot | None) -> WorkspaceSummaryRead | None:
    if row is None or not _has_built_snapshot(row):
        return None
    try:
        return WorkspaceSummaryRead.model_validate(row.payload)
    except Exception:
        logger.warning(
            "invalid workspace snapshot payload workspace_id=%s version=%s",
            row.workspace_id,
            row.version,
        )
        return None


def _empty_metrics() -> WorkspaceSummaryRead:
    return WorkspaceSummaryRead(
        domain_count=0,
        capability_count=0,
        system_count=0,
        product_count=0,
        process_count=0,
        journey_count=0,
        investment_count=0,
        map_initialized=False,
        incomplete_domain_count=0,
        capabilities_without_system_count=0,
        products_without_capabilities_count=0,
        capabilities_without_owner_count=0,
    )


async def get_workspace_snapshot_response(
    db: AsyncSession, workspace_id: UUID, org_id: UUID
) -> WorkspaceSnapshotResponse:
    """Return last good snapshot; never block on rebuild (client polls while rebuilding)."""
    row = await _get_or_create_row(db, workspace_id, org_id)
    metrics = _metrics_from_row(row)
    pending = _is_rebuild_pending(workspace_id)

    # Recover from a prior crash / cancelled task leaving rebuilding=True with no worker.
    if row.rebuilding and not pending:
        row.rebuilding = False

    needs_rebuild = row.dirty or metrics is None
    if needs_rebuild and not pending and not row.rebuilding:
        immediate = row.version == 0 or not row.payload
        schedule_snapshot_rebuild(workspace_id, org_id, immediate=immediate)

    rebuilding = bool(row.rebuilding or pending)
    stale = bool(row.dirty or rebuilding)

    return WorkspaceSnapshotResponse(
        version=row.version,
        built_at=row.built_at,
        stale=stale,
        rebuilding=rebuilding,
        metrics=metrics or _empty_metrics(),
    )
