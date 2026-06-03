import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class WorkspaceSnapshot(Base):
    """Derived read model — rebuilt asynchronously when repository / views data changes."""

    __tablename__ = "workspace_snapshots"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    built_at: Mapped[datetime | None] = mapped_column(nullable=True)
    dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rebuilding: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dirty_at: Mapped[datetime | None] = mapped_column(nullable=True)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_workspace_snapshots_org_id", "org_id"),)
