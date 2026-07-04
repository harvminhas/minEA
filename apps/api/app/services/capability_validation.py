from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.objects import ObjectCreate, ObjectUpdate
from app.services.capability_map import (
    capability_name_exists_in_domain,
    domain_name_exists,
    get_domain,
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
        body.properties = normalized


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
    domain_id_raw = merged_props.get("domain_id")
    if not domain_id_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Every capability must belong to a domain (properties.domain_id is required)",
        )

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

    if merged_props.get("parent_id") and str(merged_props.get("parent_id")) != str(domain_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Capabilities use domain_id only — no nested hierarchy beyond domain",
        )

    name = body.name if isinstance(body, ObjectCreate) else (body.name or existing_name)

    if name and await capability_name_exists_in_domain(
        db, workspace_id, org_id, domain_id, name, exclude_id=existing_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Capability '{name}' already exists in domain '{domain.name}'",
        )
