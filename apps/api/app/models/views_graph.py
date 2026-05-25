"""View graph entities — products, realizations, processes, journeys, investments."""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Double,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    product_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    lifecycle: Mapped[str] = mapped_column(Text, default="planned")
    owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    capabilities: Mapped[list["ProductCapability"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    system_overrides: Mapped[list["ProductSystemOverride"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_products_workspace_id", "workspace_id"),
        Index("ix_products_org_id", "org_id"),
    )


class ProductCapability(Base):
    __tablename__ = "product_capabilities"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    capability_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("objects.id", ondelete="CASCADE"), primary_key=True
    )

    product: Mapped["Product"] = relationship(back_populates="capabilities")


class ProductSystemOverride(Base):
    __tablename__ = "product_system_overrides"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    system_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("objects.id", ondelete="CASCADE"), primary_key=True
    )

    product: Mapped["Product"] = relationship(back_populates="system_overrides")


class Realization(Base):
    __tablename__ = "realizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    capability_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("objects.id"), nullable=False)
    maturity: Mapped[str] = mapped_column(Text, default="manual")
    owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    volume_pct: Mapped[float | None] = mapped_column(Double, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    systems: Mapped[list["RealizationSystem"]] = relationship(
        back_populates="realization", cascade="all, delete-orphan"
    )


class RealizationSystem(Base):
    __tablename__ = "realization_systems"

    realization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realizations.id", ondelete="CASCADE"), primary_key=True
    )
    system_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("objects.id", ondelete="CASCADE"), primary_key=True
    )

    realization: Mapped["Realization"] = relationship(back_populates="systems")


class Process(Base):
    __tablename__ = "processes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_event: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_delivered: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="draft")
    canvas_layout: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    graph_edges: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    stages: Mapped[list["Stage"]] = relationship(back_populates="process", cascade="all, delete-orphan")


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("processes.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    cycle_time_current: Mapped[float | None] = mapped_column(Double, nullable=True)
    cycle_time_target: Mapped[float | None] = mapped_column(Double, nullable=True)
    owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    typical_duration: Mapped[str | None] = mapped_column(Text, nullable=True)
    transition_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    transition_trigger: Mapped[str | None] = mapped_column(Text, nullable=True)
    transition_handoff: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    process: Mapped["Process"] = relationship(back_populates="stages")
    capabilities: Mapped[list["StageCapability"]] = relationship(
        back_populates="stage", cascade="all, delete-orphan"
    )


class StageCapability(Base):
    __tablename__ = "stage_capabilities"

    stage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stages.id", ondelete="CASCADE"), primary_key=True
    )
    capability_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("objects.id", ondelete="CASCADE"), primary_key=True
    )

    stage: Mapped["Stage"] = relationship(back_populates="capabilities")


class CustomerJourney(Base):
    __tablename__ = "customer_journeys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_segment: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class Investment(Base):
    __tablename__ = "investments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    target_realization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("realizations.id", ondelete="CASCADE"), nullable=False
    )
    hypothesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="proposed")
    expected_cycle_time_delta: Mapped[float | None] = mapped_column(Double, nullable=True)
    expected_cost_delta: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    expected_throughput_delta: Mapped[float | None] = mapped_column(Double, nullable=True)
    effort_estimate: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
