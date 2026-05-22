import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    from_object_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("objects.id", ondelete="CASCADE"), nullable=False)
    from_type: Mapped[str] = mapped_column(Text, nullable=False)
    to_object_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("objects.id", ondelete="CASCADE"), nullable=False)
    to_type: Mapped[str] = mapped_column(Text, nullable=False)
    attributes: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("ix_relationships_workspace_type", "workspace_id", "type"),
        Index("ix_relationships_from_object_id", "from_object_id"),
        Index("ix_relationships_to_object_id", "to_object_id"),
    )
