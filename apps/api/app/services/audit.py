"""Append-only audit log for org membership and workspace lifecycle events."""
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenancy import AuditLog


async def log_audit(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        org_id=org_id,
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata_=metadata or {},
    )
    db.add(entry)
    await db.flush()
    return entry
