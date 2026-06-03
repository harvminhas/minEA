"""Notify snapshot store after workspace repository / view-graph writes."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.workspace_snapshot_store import mark_snapshot_dirty, schedule_snapshot_rebuild


async def notify_workspace_data_changed(
    db: AsyncSession, workspace_id: UUID, org_id: UUID
) -> None:
    """Mark snapshot stale in the current transaction; schedule debounced rebuild after commit."""
    await mark_snapshot_dirty(db, workspace_id, org_id)
    schedule_snapshot_rebuild(workspace_id, org_id)
