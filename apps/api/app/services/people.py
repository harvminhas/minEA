from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.objects import MinEAObject
from app.models.people import PeopleAccountability, PeopleRole, Team, TeamRoleAssignment
from app.models.views_graph import Process, Product
from app.schemas.people import (
    AccountabilityRead,
    EntityAccountabilityRead,
    TeamRoleOnTeamRead,
    TeamUsingRoleRead,
)
from app.services.owner_accountability_sync import owner_link_kinds

OBJECT_ENTITY_KINDS = ("capability", "business_domain", "application", "data_domain", "data_store")


def is_owner_row(row: PeopleAccountability, owner_team_id: UUID | None) -> bool:
    """True when this row is the owner-team sync row: the entity's owner team with owns (or the
    legacy manages / stewards verb older syncs wrote). Those read "Owns" / "Owned by"."""
    return (
        owner_team_id is not None
        and row.subject_type == "team"
        and row.subject_id == owner_team_id
        and row.link_kind in owner_link_kinds(row.entity_kind)
    )


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
        r.entity_id
        for r in rows
        if r.entity_kind
        in ("capability", "business_domain", "application", "data_domain", "data_store")
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
        owner_entity = (
            products.get(row.entity_id)
            if row.entity_kind == "product"
            else processes.get(row.entity_id)
            if row.entity_kind == "process"
            else objects.get(row.entity_id)
        )
        is_owner = is_owner_row(row, getattr(owner_entity, "owner_team_id", None))
        if row.entity_kind == "product":
            product = products.get(row.entity_id)
            if product:
                name = product.name
                subtitle = product.product_line
        elif row.entity_kind == "process":
            process = processes.get(row.entity_id)
            if process:
                name = process.name
        elif row.entity_kind in ("capability", "business_domain", "application", "data_domain", "data_store"):
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
                elif row.entity_kind == "data_domain":
                    entity_count = await db.scalar(
                        select(func.count())
                        .select_from(MinEAObject)
                        .where(
                            MinEAObject.workspace_id == workspace_id,
                            MinEAObject.org_id == org_id,
                            MinEAObject.type == "data_object",
                            MinEAObject.properties["data_domain_id"].astext == str(obj.id),
                        )
                    )
                    subtitle = f"{entity_count or 0} entities"
                elif row.entity_kind == "data_store":
                    domain_id = (obj.properties or {}).get("data_domain_id")
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
                is_owner=is_owner,
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


async def load_entity_accountabilities(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    entity_kind: str,
    entity_id: UUID,
) -> list[EntityAccountabilityRead]:
    """Teams and roles accountable for one entity, read from the entity's side ("Owned by Finance")."""
    rows = list(
        (
            await db.execute(
                select(PeopleAccountability)
                .where(
                    PeopleAccountability.workspace_id == workspace_id,
                    PeopleAccountability.org_id == org_id,
                    PeopleAccountability.entity_kind == entity_kind,
                    PeopleAccountability.entity_id == entity_id,
                )
                .order_by(PeopleAccountability.link_kind, PeopleAccountability.created_at)
            )
        ).scalars().all()
    )
    if not rows:
        return []
    owner_team_id: UUID | None = None
    model = Product if entity_kind == "product" else Process if entity_kind == "process" else MinEAObject
    owner_team_id = await db.scalar(
        select(model.owner_team_id).where(model.id == entity_id, model.workspace_id == workspace_id, model.org_id == org_id)
    )
    team_ids = [r.subject_id for r in rows if r.subject_type == "team"]
    role_ids = [r.subject_id for r in rows if r.subject_type == "role"]
    names: dict[UUID, str] = {}
    if team_ids:
        names.update({t.id: t.name for t in (await db.execute(select(Team).where(Team.id.in_(team_ids)))).scalars()})
    if role_ids:
        names.update(
            {r.id: r.name for r in (await db.execute(select(PeopleRole).where(PeopleRole.id.in_(role_ids)))).scalars()}
        )
    return [
        EntityAccountabilityRead(
            id=row.id,
            subject_type=row.subject_type,
            subject_id=row.subject_id,
            subject_name=names.get(row.subject_id, "Unknown"),
            link_kind=row.link_kind,
            is_owner=is_owner_row(row, owner_team_id),
        )
        for row in rows
    ]


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
        "data_domain": "data_domain",
        "data_store": "data_store",
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
