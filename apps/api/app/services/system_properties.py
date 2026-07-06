"""System (application layer) property normalization and validation."""
from __future__ import annotations

from fastapi import HTTPException, status

SYSTEM_OBJECT_TYPES = frozenset({"application", "solution", "technical_capability"})

GOVERNANCE_STATUSES = frozenset({"sanctioned", "shadow", "unknown_provenance"})

SYSTEM_CATEGORIES = frozenset(
    {
        "Analytics",
        "Collaboration",
        "Commerce",
        "CRM",
        "CX",
        "ERP",
        "Finance",
        "HR",
        "Infrastructure",
        "Integration",
        "Supply Chain",
        "Other",
    }
)

# Legacy values that indicated build origin rather than functional domain.
_CUSTOM_CATEGORY_VALUES = frozenset(
    {
        "custom",
        "custom-built",
        "custom built",
        "in-house",
        "in house",
        "internal",
        "bespoke",
    }
)


def is_system_object_type(object_type: str) -> bool:
    return object_type in SYSTEM_OBJECT_TYPES


def normalize_system_properties(
    props: dict | None,
    *,
    existing: dict | None = None,
) -> dict:
    merged = {**(existing or {}), **(props or {})}
    result: dict = {}

    for key, value in merged.items():
        if key in {"node_layout", "platform"}:
            result[key] = value
            continue
        if value is None:
            continue
        result[key] = value

    raw_custom = result.get("is_custom_built", False)
    result["is_custom_built"] = bool(raw_custom) if raw_custom is not None else False

    category = result.get("category")
    if category is not None:
        category = str(category).strip()
        if not category:
            result.pop("category", None)
        else:
            lowered = category.lower()
            if lowered in _CUSTOM_CATEGORY_VALUES:
                result["is_custom_built"] = True
                legacy = result.get("category_legacy") or category
                result["category_legacy"] = legacy
                result["category_review_required"] = True
                result.pop("category", None)
            else:
                result["category"] = category

    if result.get("category") in SYSTEM_CATEGORIES:
        result.pop("category_review_required", None)
        legacy = result.get("category_legacy")
        if legacy and result.get("category") != legacy:
            result.pop("category_legacy", None)

    gov = result.get("governance_status")
    if gov is None or gov == "":
        result["governance_status"] = "sanctioned"
    else:
        result["governance_status"] = str(gov).strip()

    discovery = result.get("discovery")
    if discovery is not None:
        discovery = str(discovery).strip()
        if discovery:
            result["discovery"] = discovery[:500]
        else:
            result.pop("discovery", None)

    return result


def validate_system_properties(props: dict) -> None:
    gov = props.get("governance_status", "sanctioned")
    if gov not in GOVERNANCE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid governance status '{gov}'. "
                "Choose sanctioned, shadow, or unknown_provenance."
            ),
        )

    category = props.get("category")
    if category is None or category == "":
        return
    if category in SYSTEM_CATEGORIES:
        return
    # Grandfathered rows flagged by migration — allow edits until re-categorized.
    if props.get("category_review_required"):
        return
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"Invalid system category '{category}'. "
            f"Choose a functional domain or leave category empty until reviewed."
        ),
    )
