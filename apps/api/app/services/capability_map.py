from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.capability_templates import get_template, list_templates
from app.models.objects import MinEAObject
from app.models.relationships import Relationship

VALID_FITNESS = frozenset({"none", "weak", "adequate", "strong"})


async def map_is_initialized(db: AsyncSession, workspace_id: UUID, org_id: UUID) -> bool:
    result = await db.execute(
        select(func.count())
        .select_from(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "business_domain",
        )
    )
    return (result.scalar_one() or 0) > 0


async def get_domain(
    db: AsyncSession, workspace_id: UUID, org_id: UUID, domain_id: UUID
) -> MinEAObject | None:
    result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == domain_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "business_domain",
        )
    )
    return result.scalar_one_or_none()


async def capability_name_exists_in_domain(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    name: str,
    exclude_id: UUID | None = None,
) -> bool:
    q = select(MinEAObject.id).where(
        MinEAObject.workspace_id == workspace_id,
        MinEAObject.org_id == org_id,
        MinEAObject.type == "capability",
        MinEAObject.properties["domain_id"].astext == str(domain_id),
        func.lower(MinEAObject.name) == name.strip().lower(),
    )
    if exclude_id:
        q = q.where(MinEAObject.id != exclude_id)
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None


async def domain_name_exists(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    name: str,
    exclude_id: UUID | None = None,
) -> bool:
    q = select(MinEAObject.id).where(
        MinEAObject.workspace_id == workspace_id,
        MinEAObject.org_id == org_id,
        MinEAObject.type == "business_domain",
        func.lower(MinEAObject.name) == name.strip().lower(),
    )
    if exclude_id:
        q = q.where(MinEAObject.id != exclude_id)
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None


async def load_capability_map(
    db: AsyncSession, workspace_id: UUID, org_id: UUID
) -> tuple[list[MinEAObject], list[MinEAObject]]:
    domains_result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "business_domain",
        )
        .order_by(
            MinEAObject.properties["order_index"].astext.asc().nulls_last(),
            MinEAObject.name,
        )
    )
    domains = list(domains_result.scalars().all())

    caps_result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "capability",
        )
        .order_by(
            MinEAObject.properties["order_index"].astext.asc().nulls_last(),
            MinEAObject.name,
        )
    )
    capabilities = list(caps_result.scalars().all())
    return domains, capabilities


async def adopt_template(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    template_id: str,
) -> tuple[list[MinEAObject], list[MinEAObject]]:
    if await map_is_initialized(db, workspace_id, org_id):
        raise ValueError("Capability map is already initialized")

    template = get_template(template_id)
    if not template:
        raise ValueError(f"Unknown template: {template_id}")

    created_domains: list[MinEAObject] = []
    created_capabilities: list[MinEAObject] = []

    for domain_index, domain_def in enumerate(template["domains"]):
        domain = MinEAObject(
            workspace_id=workspace_id,
            org_id=org_id,
            type="business_domain",
            name=domain_def["name"],
            status="active",
            tags=[],
            properties={
                "order_index": domain_index,
                "icon": domain_def["icon"],
                "source_template_id": template_id,
            },
            created_by=user_id,
        )
        db.add(domain)
        await db.flush()
        created_domains.append(domain)

        for cap_index, cap_name in enumerate(domain_def["capabilities"]):
            capability = MinEAObject(
                workspace_id=workspace_id,
                org_id=org_id,
                type="capability",
                name=cap_name,
                status="active",
                tags=[],
                properties={
                    "domain_id": str(domain.id),
                    "order_index": cap_index,
                },
                created_by=user_id,
            )
            db.add(capability)
            created_capabilities.append(capability)

    await db.flush()
    return created_domains, created_capabilities


def templates_for_api() -> list[dict]:
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "icon": t["icon"],
            "domain_count": t["domain_count"],
            "capability_count": t["capability_count"],
        }
        for t in list_templates()
    ]


def template_detail_for_api(template_id: str) -> dict | None:
    template = get_template(template_id)
    if not template:
        return None
    return {
        "id": template["id"],
        "name": template["name"],
        "description": template["description"],
        "icon": template["icon"],
        "domain_count": template["domain_count"],
        "capability_count": template["capability_count"],
        "domains": [
            {
                "name": d["name"],
                "icon": d["icon"],
                "capabilities": list(d["capabilities"]),
            }
            for d in template["domains"]
        ],
    }


def library_domain_groups(existing_domain_names: list[str]) -> list[dict]:
    existing = {name.strip().lower() for name in existing_domain_names if name.strip()}
    groups: list[dict] = []
    for template in list_templates():
        groups.append(
            {
                "template_id": template["id"],
                "template_name": template["name"],
                "template_icon": template["icon"],
                "domains": [
                    {
                        "name": domain["name"],
                        "icon": domain["icon"],
                        "template_id": template["id"],
                        "already_on_map": domain["name"].strip().lower() in existing,
                    }
                    for domain in template["domains"]
                ],
            }
        )
    return groups


def capability_picker_suggestions(
    domain_name: str,
    existing_capability_names: list[str],
    capabilities_in_other_domains: list[tuple[str, str]],
) -> dict:
    existing = {name.strip().lower() for name in existing_capability_names if name.strip()}

    reusable_seen: set[str] = set()
    reusable: list[dict] = []
    for cap_name, from_domain in capabilities_in_other_domains:
        key = cap_name.strip()
        if not key or key.lower() in existing or key.lower() in reusable_seen:
            continue
        if from_domain.strip().lower() == domain_name.strip().lower():
            continue
        reusable_seen.add(key.lower())
        reusable.append({"name": key, "from_domain": from_domain})

    reusable.sort(key=lambda item: item["name"].lower())

    template_groups: list[dict] = []
    for template in list_templates():
        capabilities: list[dict] = []
        for domain in template["domains"]:
            if domain["name"].strip().lower() != domain_name.strip().lower():
                continue
            for cap_name in domain["capabilities"]:
                key = cap_name.strip()
                if not key:
                    continue
                capabilities.append(
                    {
                        "name": key,
                        "already_in_domain": key.lower() in existing,
                    }
                )
        template_groups.append(
            {
                "template_id": template["id"],
                "template_name": template["name"],
                "template_icon": template["icon"],
                "capabilities": capabilities,
            }
        )

    return {"reusable": reusable, "template_groups": template_groups}


async def load_domain_capabilities(
    db: AsyncSession, workspace_id: UUID, org_id: UUID, domain_id: UUID
) -> list[MinEAObject]:
    result = await db.execute(
        select(MinEAObject)
        .where(
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "capability",
            MinEAObject.properties["domain_id"].astext == str(domain_id),
        )
        .order_by(
            MinEAObject.properties["order_index"].astext.asc().nulls_last(),
            MinEAObject.name,
        )
    )
    return list(result.scalars().all())


def _normalize_fitness(value: object | None) -> str:
    if isinstance(value, str) and value in VALID_FITNESS and value != "none":
        return value
    return "adequate"


async def load_domain_detail(
    db: AsyncSession, workspace_id: UUID, org_id: UUID, domain_id: UUID
) -> dict | None:
    domain = await get_domain(db, workspace_id, org_id, domain_id)
    if not domain:
        return None

    props = domain.properties or {}
    pinned_system_ids = [
        str(system_id)
        for system_id in props.get("mapping_system_ids", [])
        if str(system_id).strip()
    ]

    capabilities = await load_domain_capabilities(db, workspace_id, org_id, domain_id)
    cap_ids = [cap.id for cap in capabilities]

    mappings: list[dict] = []
    rel_system_ids: set[str] = set()
    mapped_cap_ids: set[str] = set()

    if cap_ids:
        rel_result = await db.execute(
            select(Relationship).where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.type == "supported_by",
                Relationship.from_object_id.in_(cap_ids),
                Relationship.to_type == "application",
            )
        )
        for rel in rel_result.scalars().all():
            fitness = _normalize_fitness(rel.attributes.get("fitness"))
            system_id = str(rel.to_object_id)
            rel_system_ids.add(system_id)
            mapped_cap_ids.add(str(rel.from_object_id))
            mappings.append(
                {
                    "capability_id": str(rel.from_object_id),
                    "system_id": system_id,
                    "relationship_id": str(rel.id),
                    "fitness": fitness,
                }
            )

    ordered_system_ids: list[str] = []
    seen: set[str] = set()
    for system_id in pinned_system_ids:
        if system_id not in seen:
            ordered_system_ids.append(system_id)
            seen.add(system_id)
    for system_id in sorted(rel_system_ids):
        if system_id not in seen:
            ordered_system_ids.append(system_id)
            seen.add(system_id)

    systems: list[dict] = []
    if ordered_system_ids:
        sys_result = await db.execute(
            select(MinEAObject).where(
                MinEAObject.workspace_id == workspace_id,
                MinEAObject.org_id == org_id,
                MinEAObject.type == "application",
                MinEAObject.id.in_([UUID(system_id) for system_id in ordered_system_ids]),
            )
        )
        systems_by_id = {str(system.id): system for system in sys_result.scalars().all()}
        for system_id in ordered_system_ids:
            system = systems_by_id.get(system_id)
            if not system:
                continue
            system_props = system.properties or {}
            systems.append(
                {
                    "id": str(system.id),
                    "name": system.name,
                    "category": system_props.get("category"),
                    "vendor": system_props.get("vendor"),
                    "status": system.status,
                    "hosting_model": system_props.get("hosting_model"),
                }
            )

    fitness_counts = {"strong": 0, "adequate": 0, "weak": 0}
    for mapping in mappings:
        fitness = mapping["fitness"]
        if fitness in fitness_counts:
            fitness_counts[fitness] += 1

    gap_count = sum(1 for cap in capabilities if str(cap.id) not in mapped_cap_ids)

    return {
        "id": str(domain.id),
        "name": domain.name,
        "icon": props.get("icon"),
        "owner": domain.owner,
        "description": domain.description,
        "source_template_id": props.get("source_template_id"),
        "capabilities": [
            {
                "id": str(cap.id),
                "name": cap.name,
                "domain_id": str(domain_id),
                "order_index": cap.properties.get("order_index"),
                "maturity": cap.properties.get("maturity"),
                "investment": cap.properties.get("investment"),
            }
            for cap in capabilities
        ],
        "systems": systems,
        "mappings": mappings,
        "stats": {
            "capability_count": len(capabilities),
            "mapped_system_count": len(systems),
            "strong_count": fitness_counts["strong"],
            "adequate_count": fitness_counts["adequate"],
            "weak_count": fitness_counts["weak"],
            "gap_count": gap_count,
        },
    }


async def _ensure_mapping_system(
    db: AsyncSession, domain: MinEAObject, system_id: UUID
) -> None:
    props = dict(domain.properties or {})
    pinned = [str(item) for item in props.get("mapping_system_ids", []) if str(item).strip()]
    system_key = str(system_id)
    if system_key not in pinned:
        pinned.append(system_key)
    props["mapping_system_ids"] = pinned
    domain.properties = props


async def add_domain_mapping_system(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    system_id: UUID,
) -> None:
    domain = await get_domain(db, workspace_id, org_id, domain_id)
    if not domain:
        raise ValueError("Domain not found")

    system_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == system_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "application",
        )
    )
    if not system_result.scalar_one_or_none():
        raise ValueError("System not found")

    await _ensure_mapping_system(db, domain, system_id)


async def create_domain_mapping_system(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    domain_id: UUID,
    name: str,
    category: str | None = None,
    vendor: str | None = None,
    hosting_model: str | None = None,
) -> MinEAObject:
    domain = await get_domain(db, workspace_id, org_id, domain_id)
    if not domain:
        raise ValueError("Domain not found")

    trimmed = name.strip()
    if not trimmed:
        raise ValueError("System name is required")

    system = MinEAObject(
        workspace_id=workspace_id,
        org_id=org_id,
        type="application",
        name=trimmed,
        status="active",
        tags=[],
        properties={
            **({"category": category} if category else {}),
            **({"vendor": vendor} if vendor else {}),
            **({"hosting_model": hosting_model} if hosting_model else {}),
        },
        created_by=user_id,
    )
    db.add(system)
    await db.flush()
    await _ensure_mapping_system(db, domain, system.id)
    return system


async def upsert_domain_mapping(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    domain_id: UUID,
    capability_id: UUID,
    system_id: UUID,
    fitness: str,
) -> None:
    if fitness not in VALID_FITNESS:
        raise ValueError("Invalid fitness value")

    domain = await get_domain(db, workspace_id, org_id, domain_id)
    if not domain:
        raise ValueError("Domain not found")

    capability_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == capability_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "capability",
            MinEAObject.properties["domain_id"].astext == str(domain_id),
        )
    )
    if not capability_result.scalar_one_or_none():
        raise ValueError("Capability not found in this domain")

    system_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id == system_id,
            MinEAObject.workspace_id == workspace_id,
            MinEAObject.org_id == org_id,
            MinEAObject.type == "application",
        )
    )
    if not system_result.scalar_one_or_none():
        raise ValueError("System not found")

    rel_result = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == workspace_id,
            Relationship.org_id == org_id,
            Relationship.type == "supported_by",
            Relationship.from_object_id == capability_id,
            Relationship.to_object_id == system_id,
        )
    )
    existing = rel_result.scalar_one_or_none()

    if fitness == "none":
        if existing:
            await db.delete(existing)
        return

    await _ensure_mapping_system(db, domain, system_id)

    if existing:
        existing.attributes = {**(existing.attributes or {}), "fitness": fitness}
        return

    rel = Relationship(
        workspace_id=workspace_id,
        org_id=org_id,
        type="supported_by",
        from_object_id=capability_id,
        from_type="capability",
        to_object_id=system_id,
        to_type="application",
        attributes={"fitness": fitness},
        created_by=user_id,
    )
    db.add(rel)
