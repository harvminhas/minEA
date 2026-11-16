from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.objects import ObjectCreate, ObjectUpdate
from app.services.capability_map import (
    capability_name_exists_in_domain,
    capability_name_exists_under_parent,
    domain_name_exists,
    get_domain,
    is_l3,
)
from app.services.system_properties import (
    is_system_object_type,
    normalize_system_properties,
    validate_system_properties,
)


async def validate_object_write(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    body: ObjectCreate | ObjectUpdate,
    *,
    object_type: str,
    existing_id: UUID | None = None,
    existing_properties: dict | None = None,
    existing_name: str | None = None,
) -> None:
    if object_type == "business_domain":
        await _validate_domain(db, workspace_id, org_id, body, existing_id=existing_id)
    elif object_type == "capability":
        await _validate_capability(
            db,
            workspace_id,
            org_id,
            body,
            existing_id=existing_id,
            existing_properties=existing_properties or {},
            existing_name=existing_name,
        )
    elif is_system_object_type(object_type):
        _validate_system(body, existing_properties=existing_properties or {})


def _validate_system(
    body: ObjectCreate | ObjectUpdate,
    *,
    existing_properties: dict,
) -> None:
    incoming = body.properties or {}
    normalized = normalize_system_properties(incoming, existing=existing_properties)
    validate_system_properties(normalized)
    if isinstance(body, ObjectCreate):
        body.properties = normalized
    elif body.properties is not None:
        # None means the field was cleared. normalize drops those, so put them
        # back and let the router's merge delete the stored key.
        cleared = {
            key: None
            for key, value in incoming.items()
            if value is None and key not in normalized
        }
        body.properties = {**normalized, **cleared}


async def _validate_domain(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    body: ObjectCreate | ObjectUpdate,
    *,
    existing_id: UUID | None,
) -> None:
    name = getattr(body, "name", None)
    if name and await domain_name_exists(db, workspace_id, org_id, name, exclude_id=existing_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain '{name}' already exists in this workspace",
        )

    props = body.properties or {}
    if props.get("domain_id") or props.get("parent_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domains are level 1 only and cannot belong to another domain",
        )


async def _validate_capability(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    body: ObjectCreate | ObjectUpdate,
    *,
    existing_id: UUID | None,
    existing_properties: dict,
    existing_name: str | None = None,
) -> None:
    merged_props = {**existing_properties, **(body.properties or {})}
    parent_raw = merged_props.get("parent_id")
    domain_id_raw = merged_props.get("domain_id")
    name = body.name if isinstance(body, ObjectCreate) else (body.name or existing_name)

    parent = None
    if parent_raw and (not domain_id_raw or str(parent_raw) != str(domain_id_raw)):
        try:
            parent_id = UUID(str(parent_raw))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid parent_id on capability") from exc
        if existing_id and parent_id == existing_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A capability cannot be its own parent")
        from sqlalchemy import select
        from app.models.objects import MinEAObject

        parent = (
            await db.execute(
                select(MinEAObject).where(
                    MinEAObject.id == parent_id,
                    MinEAObject.workspace_id == workspace_id,
                    MinEAObject.org_id == org_id,
                    MinEAObject.type == "capability",
                )
            )
        ).scalar_one_or_none()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="parent_id must be an existing capability in this workspace",
            )
        if is_l3(parent.properties):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Activities nest under a capability, not under another activity",
            )
        parent_domain = (parent.properties or {}).get("domain_id")
        if domain_id_raw and parent_domain and str(domain_id_raw) != str(parent_domain):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An activity must stay in the same domain as its parent capability",
            )
        if not domain_id_raw and parent_domain:
            # Inherit the parent's domain so the unique indexes and the map agree.
            if body.properties is None:
                body.properties = {}
            body.properties["domain_id"] = str(parent_domain)
            domain_id_raw = str(parent_domain)
        if name and await capability_name_exists_under_parent(
            db, workspace_id, org_id, parent_id, name, exclude_id=existing_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{name}' already exists under '{parent.name}'",
            )
        return

    if not domain_id_raw:
        # Domain is an optional grouping; a capability without one is a valid L2.
        return

    try:
        domain_id = UUID(str(domain_id_raw))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid domain_id on capability",
        ) from exc

    domain = await get_domain(db, workspace_id, org_id, domain_id)
    if not domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Capability domain_id must reference an existing business domain",
        )

    if name and await capability_name_exists_in_domain(
        db, workspace_id, org_id, domain_id, name, exclude_id=existing_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Capability '{name}' already exists in domain '{domain.name}'",
        )
