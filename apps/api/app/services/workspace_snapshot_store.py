"""Postgres JSONB workspace snapshot — stale-while-revalidate read model."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, engine
from app.models.workspace_snapshot import WorkspaceSnapshot
from app.schemas.workspace_summary import WorkspaceSnapshotResponse, WorkspaceSummaryRead
from app.services.workspace_summary import fetch_workspace_summary
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

DEBOUNCE_SECONDS = 0.45
WRITE_LOCK_TIMEOUT = "10s"
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
    # Bounded wait: a stuck lock holder now fails the write in seconds instead of hanging the
    # request until the platform timeout. Scoped to this request's transaction.
    await db.execute(text("SELECT set_config('lock_timeout', :t, true)"), {"t": WRITE_LOCK_TIMEOUT})
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


# Background rebuild bookkeeping runs as single autocommit statements. On Vercel the function can be
# frozen right after the response, with this task mid-flight: an ORM UPDATE followed by a separate
# COMMIT could freeze in between and leave the workspace_snapshots row locked "idle in transaction".
# Every later write in that workspace (delete, edit) then waited on that lock in
# notify_workspace_data_changed until the function timed out (FUNCTION_INVOCATION_TIMEOUT).
# A single autocommit statement holds the row lock only while Postgres runs it.
_MARK_REBUILDING = text(
    """
    INSERT INTO workspace_snapshots (workspace_id, org_id, version, payload, dirty, rebuilding, dirty_at)
    VALUES (:workspace_id, :org_id, 0, '{}'::jsonb, TRUE, TRUE, now())
    ON CONFLICT (workspace_id) DO UPDATE SET rebuilding = TRUE, org_id = EXCLUDED.org_id
    """
)
_STORE_BUILT = text(
    """
    UPDATE workspace_snapshots
    SET payload = CAST(:payload AS jsonb), version = version + 1, built_at = now(),
        dirty = FALSE, rebuilding = FALSE, dirty_at = NULL
    WHERE workspace_id = :workspace_id
    """
)
_MARK_FAILED = text(
    "UPDATE workspace_snapshots SET rebuilding = FALSE, dirty = TRUE WHERE workspace_id = :workspace_id"
)
# The summary read runs in a transaction too; if the function is frozen mid-read, Postgres ends it.
READ_IDLE_TIMEOUT = "15s"


async def _autocommit(statement, params: dict) -> None:
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        await conn.execute(statement, params)


async def rebuild_snapshot_now(workspace_id: UUID, org_id: UUID) -> None:
    """Rebuild snapshot in isolated connections (never share the request-scoped session)."""
    ids = {"workspace_id": workspace_id}
    await _autocommit(_MARK_REBUILDING, {**ids, "org_id": org_id})
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("SELECT set_config('idle_in_transaction_session_timeout', :t, true)"),
                {"t": READ_IDLE_TIMEOUT},
            )
            await _set_rls_org(db, org_id)
            summary = await fetch_workspace_summary(db, workspace_id, org_id)
            payload = summary.model_dump(mode="json")
            await db.rollback()
        await _autocommit(_STORE_BUILT, {**ids, "payload": json.dumps(payload)})
    except Exception:
        logger.exception("workspace snapshot rebuild failed workspace_id=%s", workspace_id)
        await _autocommit(_MARK_FAILED, ids)
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
