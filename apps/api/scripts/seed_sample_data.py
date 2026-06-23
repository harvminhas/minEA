#!/usr/bin/env python3
"""Seed a workspace with representative demo data.

Usage (from apps/api, with DATABASE_URL in .env):

  python scripts/seed_sample_data.py --org acme-edomains --workspace default
  python scripts/seed_sample_data.py --org acme-edomains --workspace default --dry-run
  python scripts/seed_sample_data.py --org acme-edomains --workspace default --force

Idempotent: skips when sample_seed objects already exist unless --force is passed.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from sqlalchemy import func, select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.objects import MinEAObject, Workspace  # noqa: E402
from app.models.people import PeopleContact, Team  # noqa: E402
from app.models.relationships import Relationship  # noqa: E402
from app.models.tenancy import Org, OrgMembership  # noqa: E402
from app.models.views_graph import (  # noqa: E402
    CustomerJourney,
    JourneyMoment,
    MomentProcess,
    MomentSystem,
    Process,
    Product,
    ProductCapability,
    Realization,
    RealizationSystem,
    Stage,
    StageCapability,
)
from app.services.owner_fields import apply_ownership_write_resolved  # noqa: E402

SEED_SOURCE = "sample_seed"


async def _resolve_workspace(
    db,
    *,
    org_slug: str,
    workspace_slug: str,
) -> tuple[Org, Workspace, uuid.UUID | None]:
    org = (await db.execute(select(Org).where(Org.slug == org_slug))).scalar_one_or_none()
    if not org:
        raise SystemExit(f"ERROR: org not found: {org_slug}")

    ws = (
        await db.execute(
            select(Workspace).where(Workspace.org_id == org.id, Workspace.slug == workspace_slug)
        )
    ).scalar_one_or_none()
    if not ws:
        raise SystemExit(f"ERROR: workspace not found: {org_slug}/{workspace_slug}")

    owner = (
        await db.execute(
            select(OrgMembership.user_id).where(
                OrgMembership.org_id == org.id,
                OrgMembership.role == "owner",
            )
        )
    ).scalar_one_or_none()

    return org, ws, owner


async def _seed_already_applied(db, workspace_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(func.count())
        .select_from(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.source == SEED_SOURCE,
        )
    )
    return result.scalar_one() > 0


async def _get_object_by_external_id(
    db,
    workspace_id: uuid.UUID,
    external_id: str,
) -> MinEAObject | None:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.external_id == external_id,
        )
    )
    return result.scalar_one_or_none()


async def _get_or_create_object(
    db,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    external_id: str,
    obj_type: str,
    name: str,
    description: str | None = None,
    status: str = "active",
    tags: list[str] | None = None,
    properties: dict | None = None,
    owner_team_id: uuid.UUID | None = None,
    point_of_contact_id: uuid.UUID | None = None,
) -> MinEAObject:
    existing = await _get_object_by_external_id(db, workspace_id, external_id)
    if existing:
        return existing

    obj = MinEAObject(
        workspace_id=workspace_id,
        org_id=org_id,
        type=obj_type,
        name=name,
        description=description,
        status=status,
        tags=tags or [],
        external_id=external_id,
        source=SEED_SOURCE,
        properties=properties or {},
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(obj)
    await db.flush()
    if owner_team_id or point_of_contact_id:
        await apply_ownership_write_resolved(
            db,
            obj,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            owner_team_id=owner_team_id,
            point_of_contact_id=point_of_contact_id,
        )
        await db.flush()
    return obj


async def _get_or_create_team(
    db,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    name: str,
    description: str | None = None,
) -> Team:
    result = await db.execute(
        select(Team).where(
            Team.workspace_id == workspace_id,
            Team.org_id == org_id,
            func.lower(Team.name) == name.lower(),
        )
    )
    team = result.scalar_one_or_none()
    if team:
        return team

    team = Team(
        workspace_id=workspace_id,
        org_id=org_id,
        name=name,
        description=description,
        created_by=user_id,
    )
    db.add(team)
    await db.flush()
    return team


async def _get_or_create_contact(
    db,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    name: str,
    email: str | None = None,
    team_id: uuid.UUID | None = None,
) -> PeopleContact:
    result = await db.execute(
        select(PeopleContact).where(
            PeopleContact.workspace_id == workspace_id,
            PeopleContact.org_id == org_id,
            func.lower(PeopleContact.name) == name.lower(),
        )
    )
    contact = result.scalar_one_or_none()
    if contact:
        return contact

    contact = PeopleContact(
        workspace_id=workspace_id,
        org_id=org_id,
        name=name,
        email=email,
        team_id=team_id,
        created_by=user_id,
    )
    db.add(contact)
    await db.flush()
    return contact


async def _get_or_create_relationship(
    db,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    rel_type: str,
    from_obj: MinEAObject,
    to_obj: MinEAObject,
    attributes: dict | None = None,
) -> Relationship | None:
    result = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.type == rel_type,
            Relationship.from_object_id == from_obj.id,
            Relationship.to_object_id == to_obj.id,
        )
    )
    if result.scalar_one_or_none():
        return None

    rel = Relationship(
        workspace_id=workspace_id,
        org_id=org_id,
        type=rel_type,
        from_object_id=from_obj.id,
        from_type=from_obj.type,
        to_object_id=to_obj.id,
        to_type=to_obj.type,
        attributes=attributes or {},
        created_by=user_id,
    )
    db.add(rel)
    await db.flush()
    return rel


async def _get_or_create_domain(
    db,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    name: str,
    icon: str,
    order_index: int,
) -> MinEAObject:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.type == "business_domain",
            func.lower(MinEAObject.name) == name.lower(),
        )
    )
    domain = result.scalar_one_or_none()
    if domain:
        return domain

    return await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id=f"seed:domain:{name.lower().replace(' ', '-')}",
        obj_type="business_domain",
        name=name,
        description=f"{name} business domain",
        properties={"order_index": order_index, "icon": icon, "source_template_id": "saas"},
    )


async def _get_or_create_capability(
    db,
    *,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    domain: MinEAObject,
    name: str,
    order_index: int,
    owner_team_id: uuid.UUID | None = None,
    point_of_contact_id: uuid.UUID | None = None,
) -> MinEAObject:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.type == "capability",
            func.lower(MinEAObject.name) == name.lower(),
            MinEAObject.properties["domain_id"].astext == str(domain.id),
        )
    )
    cap = result.scalar_one_or_none()
    if cap:
        return cap

    return await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id=f"seed:cap:{domain.name.lower()}:{name.lower().replace(' ', '-')}",
        obj_type="capability",
        name=name,
        description=f"{name} capability in {domain.name}",
        owner_team_id=owner_team_id,
        point_of_contact_id=point_of_contact_id,
        properties={"domain_id": str(domain.id), "order_index": order_index},
    )


async def seed_workspace(
    db,
    *,
    org: Org,
    ws: Workspace,
    user_id: uuid.UUID | None,
    dry_run: bool = False,
) -> dict[str, int]:
    counts = {
        "objects": 0,
        "relationships": 0,
        "teams": 0,
        "contacts": 0,
        "products": 0,
        "processes": 0,
        "journeys": 0,
        "realizations": 0,
    }

    workspace_id = ws.id
    org_id = org.id

    # ── People ────────────────────────────────────────────────────────────────
    crm_team = await _get_or_create_team(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="CRM Team",
        description="Owns customer relationship systems",
    )
    platform_team = await _get_or_create_team(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Platform Team",
        description="Domain registration and DNS platform",
    )
    billing_team = await _get_or_create_team(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Billing Team",
        description="Subscription billing and payments",
    )
    counts["teams"] += 3

    harvinder = await _get_or_create_contact(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Harvinder Minhas",
        team_id=crm_team.id,
    )
    sarah = await _get_or_create_contact(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Sarah Chen",
        email="sarah.chen@acme-edomains.com",
        team_id=platform_team.id,
    )
    mike = await _get_or_create_contact(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Mike Torres",
        email="mike.torres@acme-edomains.com",
        team_id=billing_team.id,
    )
    counts["contacts"] += 3

    # ── Capability map ────────────────────────────────────────────────────────
    customer_domain = await _get_or_create_domain(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Customer",
        icon="users",
        order_index=0,
    )
    billing_domain = await _get_or_create_domain(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Billing",
        icon="credit-card",
        order_index=1,
    )
    product_domain = await _get_or_create_domain(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Product",
        icon="box",
        order_index=2,
    )
    engineering_domain = await _get_or_create_domain(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        name="Engineering",
        icon="code",
        order_index=3,
    )

    onboarding = await _get_or_create_capability(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        domain=customer_domain,
        name="Customer onboarding",
        order_index=0,
        owner_team_id=crm_team.id,
        point_of_contact_id=harvinder.id,
    )
    support = await _get_or_create_capability(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        domain=customer_domain,
        name="Support",
        order_index=1,
        owner_team_id=crm_team.id,
        point_of_contact_id=harvinder.id,
    )
    subscription_mgmt = await _get_or_create_capability(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        domain=billing_domain,
        name="Subscription management",
        order_index=0,
        owner_team_id=billing_team.id,
        point_of_contact_id=mike.id,
    )
    catalog_mgmt = await _get_or_create_capability(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        domain=product_domain,
        name="Catalog management",
        order_index=0,
        owner_team_id=platform_team.id,
        point_of_contact_id=sarah.id,
    )
    build_deploy = await _get_or_create_capability(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        domain=engineering_domain,
        name="Build & deploy",
        order_index=0,
        owner_team_id=platform_team.id,
        point_of_contact_id=sarah.id,
    )
    counts["objects"] += 4  # domains (minus existing customer) + capabilities

    # ── Applications & infrastructure ───────────────────────────────────────
    dynamics = await _get_object_by_external_id(db, workspace_id, "seed:app:dynamics")
    if not dynamics:
        result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.type == "application",
                func.lower(MinEAObject.name) == "dynamics",
            )
        )
        dynamics = result.scalar_one_or_none()
    if dynamics and not dynamics.owner_team_id:
        await apply_ownership_write_resolved(
            db,
            dynamics,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            owner_team_id=crm_team.id,
            point_of_contact_id=harvinder.id,
        )

    domain_portal = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:app:domain-portal",
        obj_type="application",
        name="Domain Portal",
        description="Customer-facing domain search, registration, and management",
        status="active",
        tags=["customer-facing", "core"],
        properties={"criticality": "high", "lifecycle": "active", "hosting": "cloud"},
        owner_team_id=platform_team.id,
        point_of_contact_id=sarah.id,
    )
    billing_engine = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:app:billing-engine",
        obj_type="application",
        name="Billing Engine",
        description="Subscription billing, invoicing, and payment processing",
        status="active",
        tags=["finance", "core"],
        properties={"criticality": "high", "lifecycle": "active"},
        owner_team_id=billing_team.id,
        point_of_contact_id=mike.id,
    )
    dns_mgmt = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:app:dns-management",
        obj_type="application",
        name="DNS Management",
        description="Authoritative DNS and zone propagation",
        status="active",
        tags=["infrastructure"],
        properties={"criticality": "high", "lifecycle": "active"},
        owner_team_id=platform_team.id,
        point_of_contact_id=sarah.id,
    )
    counts["objects"] += 3

    aws = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:cloud:aws",
        obj_type="cloud_service",
        name="AWS",
        description="Primary cloud provider",
        status="active",
        properties={"provider": "aws", "region": "us-east-1"},
    )

    customer_data_domain = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:data-domain:customer",
        obj_type="data_domain",
        name="Customer Data",
        description="Customer accounts, contacts, and preferences",
        status="active",
        owner_team_id=crm_team.id,
    )
    domain_registry_store = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:data-store:domain-registry",
        obj_type="data_store",
        name="Domain Registry DB",
        description="Registered domains, TLD pricing, and WHOIS records",
        status="active",
        properties={"engine": "postgresql", "classification": "confidential"},
        owner_team_id=platform_team.id,
    )
    counts["objects"] += 3

    domain_search_api = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:api:domain-search",
        obj_type="api",
        name="Domain Search API",
        description="Search domain availability across TLDs",
        status="active",
        properties={"protocol": "rest", "version": "v2"},
        owner_team_id=platform_team.id,
    )
    registration_api = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:api:registration",
        obj_type="api",
        name="Registration API",
        description="Register and transfer domains programmatically",
        status="active",
        properties={"protocol": "rest", "version": "v1"},
        owner_team_id=platform_team.id,
    )
    domain_registered_event = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:event:domain-registered",
        obj_type="event",
        name="domain.registered",
        description="Emitted when a domain registration completes",
        status="active",
        properties={"delivery": "async", "schema_version": "1.0"},
    )
    payment_received_event = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:event:payment-received",
        obj_type="event",
        name="payment.received",
        description="Emitted when a subscription payment succeeds",
        status="active",
        properties={"delivery": "async", "schema_version": "1.0"},
    )
    registration_flow = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:flow:registration-billing",
        obj_type="integration_flow",
        name="Registration to Billing",
        description="Links domain registration completion to subscription billing",
        status="active",
        properties={"pattern": "event-driven"},
    )
    counts["objects"] += 5

    # ── Tech debt & roadmap ───────────────────────────────────────────────────
    dynamics_debt = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:tech-debt:dynamics-eol",
        obj_type="tech_debt",
        name="Dynamics on-prem end of support",
        description="On-premises Dynamics instance approaching vendor end of support",
        status="planned",
        tags=["crm", "eol"],
        properties={
            "severity": "critical",
            "debt_type": "eol_software",
            "debt_status": "open",
            "effort_estimate": "xl",
            "target_resolution": "2026-Q4",
        },
        owner_team_id=crm_team.id,
        point_of_contact_id=harvinder.id,
    )
    dns_debt = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:tech-debt:manual-dns-checks",
        obj_type="tech_debt",
        name="Manual DNS propagation checks",
        description="Operations team manually verifies DNS propagation after changes",
        status="active",
        tags=["dns", "operations"],
        properties={
            "severity": "medium",
            "debt_type": "manual_process",
            "debt_status": "open",
            "effort_estimate": "m",
        },
        owner_team_id=platform_team.id,
        point_of_contact_id=sarah.id,
    )
    counts["objects"] += 2

    now = datetime.now(UTC)
    roadmap_migrate = await _get_or_create_object(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        user_id=user_id,
        external_id="seed:roadmap:migrate-dynamics",
        obj_type="roadmap_item",
        name="Migrate Dynamics to cloud",
        description="Move CRM to cloud-hosted Dynamics before on-prem end of support",
        status="active",
        tags=["crm", "migration"],
        properties={
            "roadmap_kind": "initiative",
            "roadmap_status": "in_progress",
            "timeline_mode": "date_bound",
            "timeline_start_date": f"{now.year}-{now.month:02d}-01",
            "timeline_end_date": f"{now.year}-12-31",
            "timeline_view": f"{now.year} H2",
            "effort_estimate": "xl",
            "investment_category": "modernization",
        },
        owner_team_id=crm_team.id,
        point_of_contact_id=harvinder.id,
    )
    counts["objects"] += 1

    # ── Relationships ─────────────────────────────────────────────────────────
    rel_pairs: list[tuple[str, MinEAObject, MinEAObject]] = []
    if dynamics:
        rel_pairs.extend(
            [
                ("supported_by", onboarding, dynamics),
                ("supported_by", support, dynamics),
                ("affects", dynamics_debt, dynamics),
                ("resolves", roadmap_migrate, dynamics_debt),
            ]
        )
    rel_pairs.extend(
        [
            ("supported_by", onboarding, domain_portal),
            ("supported_by", catalog_mgmt, domain_portal),
            ("supported_by", subscription_mgmt, billing_engine),
            ("supported_by", build_deploy, dns_mgmt),
            ("exposes", domain_portal, domain_search_api),
            ("exposes", domain_portal, registration_api),
            ("publishes", domain_portal, domain_registered_event),
            ("publishes", billing_engine, payment_received_event),
            ("consumes", billing_engine, domain_search_api),
            ("stores_in", domain_portal, domain_registry_store),
            ("runs_on", domain_portal, aws),
            ("runs_on", billing_engine, aws),
            ("runs_on", dns_mgmt, aws),
            ("runs_on", domain_registry_store, aws),
            ("connects", registration_flow, registration_api),
            ("connects", registration_flow, payment_received_event),
            ("affects", dns_debt, dns_mgmt),
        ]
    )

    for rel_type, from_obj, to_obj in rel_pairs:
        rel = await _get_or_create_relationship(
            db,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            rel_type=rel_type,
            from_obj=from_obj,
            to_obj=to_obj,
        )
        if rel:
            counts["relationships"] += 1

    # ── Realizations ──────────────────────────────────────────────────────────
    async def _get_or_create_realization(cap: MinEAObject, system: MinEAObject, maturity: str) -> None:
        result = await db.execute(
            select(Realization).where(
                Realization.workspace_id == workspace_id,
                Realization.capability_id == cap.id,
            )
        )
        if result.scalar_one_or_none():
            return

        realization = Realization(
            workspace_id=workspace_id,
            org_id=org_id,
            capability_id=cap.id,
            maturity=maturity,
            owner=cap.owner,
            volume_pct=85.0,
            notes=f"Primary realization via {system.name}",
        )
        db.add(realization)
        await db.flush()
        db.add(RealizationSystem(realization_id=realization.id, system_id=system.id))
        counts["realizations"] += 1

    await _get_or_create_realization(onboarding, domain_portal, "automated")
    await _get_or_create_realization(subscription_mgmt, billing_engine, "automated")
    await _get_or_create_realization(catalog_mgmt, domain_portal, "partial")
    if dynamics:
        await _get_or_create_realization(support, dynamics, "manual")

    # ── Products ──────────────────────────────────────────────────────────────
    async def _get_or_create_product(
        external_id: str,
        name: str,
        product_line: str,
        capability_ids: list[uuid.UUID],
        owner_team_id: uuid.UUID,
        point_of_contact_id: uuid.UUID,
    ) -> Product:
        existing_obj = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.name == name,
            )
        )
        product = existing_obj.scalar_one_or_none()
        if product:
            return product

        product = Product(
            workspace_id=workspace_id,
            org_id=org_id,
            name=name,
            product_line=product_line,
            lifecycle="active",
            description=f"{name} product offering",
            created_by=user_id,
            updated_by=user_id,
        )
        db.add(product)
        await db.flush()
        await apply_ownership_write_resolved(
            db,
            product,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            owner_team_id=owner_team_id,
            point_of_contact_id=point_of_contact_id,
        )
        await db.flush()
        for cap_id in capability_ids:
            db.add(ProductCapability(product_id=product.id, capability_id=cap_id))
        counts["products"] += 1
        return product

    domain_product = await _get_or_create_product(
        "seed:product:domain-registration",
        "Domain Registration",
        "Core Platform",
        [onboarding.id, catalog_mgmt.id],
        platform_team.id,
        sarah.id,
    )
    reseller_product = await _get_or_create_product(
        "seed:product:reseller-api",
        "Reseller API",
        "Partner",
        [catalog_mgmt.id, build_deploy.id],
        platform_team.id,
        sarah.id,
    )
    _ = domain_product, reseller_product

    # ── Processes ─────────────────────────────────────────────────────────────
    async def _get_or_create_process(
        name: str,
        trigger: str,
        value: str,
        stages: list[tuple[str, uuid.UUID | None]],
        owner_team_id: uuid.UUID,
        point_of_contact_id: uuid.UUID,
    ) -> Process:
        result = await db.execute(
            select(Process).where(
                Process.workspace_id == workspace_id,
                Process.name == name,
            )
        )
        process = result.scalar_one_or_none()
        if process:
            return process

        process = Process(
            workspace_id=workspace_id,
            org_id=org_id,
            name=name,
            trigger_event=trigger,
            value_delivered=value,
            description=f"End-to-end process: {name}",
            status="live",
        )
        db.add(process)
        await db.flush()
        await apply_ownership_write_resolved(
            db,
            process,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            owner_team_id=owner_team_id,
            point_of_contact_id=point_of_contact_id,
        )
        await db.flush()

        for idx, (stage_name, cap_id) in enumerate(stages):
            stage = Stage(
                process_id=process.id,
                position=idx,
                name=stage_name,
                typical_duration="1-2 days" if idx == 0 else "same day",
            )
            db.add(stage)
            await db.flush()
            if cap_id:
                db.add(StageCapability(stage_id=stage.id, capability_id=cap_id))

        counts["processes"] += 1
        return process

    register_process = await _get_or_create_process(
        "Register new domain",
        "Customer submits domain search",
        "Customer owns an active registered domain",
        [
            ("Search & select domain", catalog_mgmt.id),
            ("Create customer account", onboarding.id),
            ("Process payment", subscription_mgmt.id),
            ("Provision DNS zone", build_deploy.id),
        ],
        platform_team.id,
        sarah.id,
    )
    renewal_process = await _get_or_create_process(
        "Process domain renewal",
        "Renewal notice period begins",
        "Domain renewed before expiry",
        [
            ("Send renewal reminder", support.id),
            ("Collect payment", subscription_mgmt.id),
            ("Extend registration", catalog_mgmt.id),
        ],
        billing_team.id,
        mike.id,
    )
    _ = register_process, renewal_process

    # ── Journeys ──────────────────────────────────────────────────────────────
    result = await db.execute(
        select(CustomerJourney).where(
            CustomerJourney.workspace_id == workspace_id,
            CustomerJourney.name == "First domain registration",
        )
    )
    journey = result.scalar_one_or_none()
    if not journey:
        journey = CustomerJourney(
            workspace_id=workspace_id,
            org_id=org_id,
            name="First domain registration",
            customer_segment="Small business owner",
            description="A new customer discovers Acme eDomains and registers their first .com",
            status="live",
        )
        db.add(journey)
        await db.flush()
        await apply_ownership_write_resolved(
            db,
            journey,
            workspace_id=workspace_id,
            org_id=org_id,
            user_id=user_id,
            owner_team_id=platform_team.id,
            point_of_contact_id=sarah.id,
        )
        await db.flush()

        steps = [
            ("Discover pricing", "Web", "Understand TLD pricing"),
            ("Search for domain", "Web", "Find an available domain name"),
            ("Create account", "Web", "Sign up and verify email"),
            ("Complete checkout", "Web", "Pay for registration"),
            ("Manage DNS", "Portal", "Configure DNS records"),
        ]
        for idx, (step_name, channel, goal) in enumerate(steps):
            moment = JourneyMoment(
                journey_id=journey.id,
                position=idx,
                name=step_name,
                channel=channel,
                goal=goal,
                touchpoint_type="digital",
            )
            db.add(moment)
            await db.flush()
            if idx in {1, 3}:
                db.add(MomentSystem(moment_id=moment.id, system_id=domain_portal.id))
            if idx == 3:
                db.add(MomentSystem(moment_id=moment.id, system_id=billing_engine.id))
            if idx == 4:
                db.add(MomentSystem(moment_id=moment.id, system_id=dns_mgmt.id))
            if idx in {1, 2, 3}:
                db.add(MomentProcess(moment_id=moment.id, process_id=register_process.id))

        counts["journeys"] += 1

    if dry_run:
        await db.rollback()
    else:
        await db.commit()

    return counts


async def async_main(args: argparse.Namespace) -> None:
    load_dotenv(API_ROOT / ".env")

    async with AsyncSessionLocal() as db:
        org, ws, user_id = await _resolve_workspace(
            db, org_slug=args.org, workspace_slug=args.workspace
        )

        if await _seed_already_applied(db, ws.id) and not args.force:
            print(
                f"Sample data already present in {args.org}/{args.workspace}. "
                "Pass --force to add any missing seed records."
            )
            return

        print(f"{'[dry-run] ' if args.dry_run else ''}Seeding {args.org}/{args.workspace} …")
        counts = await seed_workspace(
            db,
            org=org,
            ws=ws,
            user_id=user_id,
            dry_run=args.dry_run,
        )

        print("Created (approximate new records this run):")
        for key, value in counts.items():
            if value:
                print(f"  {key}: {value}")
        if args.dry_run:
            print("\nDry run — no changes written.")
        else:
            print("\nDone. Refresh the app to see sample data.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo data into a workspace")
    parser.add_argument("--org", required=True, help="Org slug (e.g. acme-edomains)")
    parser.add_argument("--workspace", default="default", help="Workspace slug")
    parser.add_argument("--dry-run", action="store_true", help="Preview without committing")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Run even when sample_seed objects already exist",
    )
    args = parser.parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
