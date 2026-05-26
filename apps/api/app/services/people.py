from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.people import PeopleAccountability, PeopleRole, Team, TeamRoleAssignment
from app.models.views_graph import Process, Product
from app.schemas.people import AccountabilityRead, TeamRoleOnTeamRead, TeamUsingRoleRead


async def resolve_accountability_labels(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    rows: list[PeopleAccountability],
) -> list[AccountabilityRead]:
    if not rows:
        return []

    product_ids = [r.entity_id for r in rows if r.entity_kind == "product"]
    object_ids = [
        r.entity_id for r in rows if r.entity_kind in ("capability", "business_domain", "application")
    ]
    process_ids = [r.entity_id for r in rows if r.entity_kind == "process"]

    products: dict[UUID, Product] = {}
    if product_ids:
        result = await db.execute(
            select(Product).where(
                Product.id.in_(product_ids),
                Product.workspace_id == workspace_id,
                Product.org_id == org_id,
            )
        )
        products = {p.id: p for p in result.scalars().all()}

    objects: dict[UUID, MinEAObject] = {}
    if object_ids:
        result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.id.in_(object_ids),
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
            )
        )
        objects = {o.id: o for o in result.scalars().all()}

    processes: dict[UUID, Process] = {}
    if process_ids:
        result = await db.execute(
            select(Process).where(
                Process.id.in_(process_ids),
                Process.workspace_id == workspace_id,
                Process.org_id == org_id,
            )
        )
        processes = {p.id: p for p in result.scalars().all()}

    reads: list[AccountabilityRead] = []
    for row in rows:
        name = "Unknown"
        subtitle: str | None = None
        if row.entity_kind == "product":
            product = products.get(row.entity_id)
            if product:
                name = product.name
                subtitle = product.product_line
        elif row.entity_kind == "process":
            process = processes.get(row.entity_id)
            if process:
                name = process.name
        elif row.entity_kind in ("capability", "business_domain", "application"):
            obj = objects.get(row.entity_id)
            if obj:
                name = obj.name
                if row.entity_kind == "business_domain":
                    cap_count = await db.scalar(
                        select(func.count())
                        .select_from(MinEAObject)
                        .where(
                            MinEAObject.workspace_id == workspace_id,
                            MinEAObject.org_id == org_id,
                            MinEAObject.type == "capability",
                            MinEAObject.properties["domain_id"].astext == str(obj.id),
                        )
                    )
                    subtitle = f"{cap_count or 0} capabilities"
                elif row.entity_kind == "capability":
                    domain_id = (obj.properties or {}).get("domain_id")
                    if domain_id:
                        dom_result = await db.execute(
                            select(MinEAObject.name).where(
                                MinEAObject.id == UUID(str(domain_id)),
                                MinEAObject.workspace_id == workspace_id,
                                MinEAObject.org_id == org_id,
                            )
                        )
                        domain_name = dom_result.scalar_one_or_none()
                        if domain_name:
                            subtitle = domain_name

        reads.append(
            AccountabilityRead(
                id=row.id,
                entity_kind=row.entity_kind,
                entity_id=row.entity_id,
                entity_name=name,
                link_kind=row.link_kind,
                subtitle=subtitle,
            )
        )
    return reads


async def load_role_teams(db: AsyncSession, role: PeopleRole) -> list[TeamUsingRoleRead]:
    result = await db.execute(
        select(TeamRoleAssignment, Team)
        .join(Team, Team.id == TeamRoleAssignment.team_id)
        .where(TeamRoleAssignment.people_role_id == role.id)
        .order_by(Team.name)
    )
    return [
        TeamUsingRoleRead(
            team_id=team.id,
            team_name=team.name,
            assignee_name=assignment.assignee_name,
            assignee_email=assignment.assignee_email,
            assignment_kind=assignment.assignment_kind,
        )
        for assignment, team in result.all()
    ]


async def load_team_roles(db: AsyncSession, team: Team) -> list[TeamRoleOnTeamRead]:
    result = await db.execute(
        select(TeamRoleAssignment, PeopleRole)
        .join(PeopleRole, PeopleRole.id == TeamRoleAssignment.people_role_id)
        .where(TeamRoleAssignment.team_id == team.id)
        .order_by(PeopleRole.name)
    )
    return [
        TeamRoleOnTeamRead(
            id=assignment.id,
            people_role_id=role.id,
            role_name=role.name,
            role_kind=role.role_kind,
            assignee_name=assignment.assignee_name,
            assignee_email=assignment.assignee_email,
            assignment_kind=assignment.assignment_kind,
        )
        for assignment, role in result.all()
    ]


async def load_accountabilities(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    subject_type: str,
    subject_id: UUID,
) -> list[AccountabilityRead]:
    result = await db.execute(
        select(PeopleAccountability)
        .where(
            PeopleAccountability.workspace_id == workspace_id,
            PeopleAccountability.org_id == org_id,
            PeopleAccountability.subject_type == subject_type,
            PeopleAccountability.subject_id == subject_id,
        )
        .order_by(PeopleAccountability.entity_kind, PeopleAccountability.link_kind)
    )
    rows = list(result.scalars().all())
    return await resolve_accountability_labels(db, workspace_id, org_id, rows)


async def validate_accountability_entity(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    entity_kind: str,
    entity_id: UUID,
) -> None:
    if entity_kind == "product":
        result = await db.execute(
            select(Product.id).where(
                Product.id == entity_id,
                Product.workspace_id == workspace_id,
                Product.org_id == org_id,
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError("Product not found")
        return

    if entity_kind == "process":
        result = await db.execute(
            select(Process.id).where(
                Process.id == entity_id,
                Process.workspace_id == workspace_id,
                Process.org_id == org_id,
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError("Process not found")
        return

    expected_type = {
        "capability": "capability",
        "business_domain": "business_domain",
        "application": "application",
    }.get(entity_kind)
    if not expected_type:
        raise ValueError("Invalid entity kind")

    result = await db.execute(
        select(MinEAObject.id).where(
            MinEAObject.id == entity_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == expected_type,
        )
    )
    if not result.scalar_one_or_none():
        raise ValueError(f"{entity_kind} not found")
