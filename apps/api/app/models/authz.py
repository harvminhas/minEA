"""Data-driven roles, permissions, and org limits."""

import uuid

from sqlalchemy import ForeignKeyConstraint, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Role(Base):
    __tablename__ = "roles"

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    scope: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Permission(Base):
    __tablename__ = "permissions"

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_slug: Mapped[str] = mapped_column(Text, primary_key=True)
    role_scope: Mapped[str] = mapped_column(Text, primary_key=True)
    permission_slug: Mapped[str] = mapped_column(Text, primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["role_slug", "role_scope"],
            ["roles.slug", "roles.scope"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["permission_slug"],
            ["permissions.slug"],
            ondelete="CASCADE",
        ),
    )


class OrgLimit(Base):
    __tablename__ = "org_limits"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    limit_key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[int | None] = mapped_column(nullable=True)
