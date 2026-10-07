import asyncio
from uuid import uuid4

from app.schemas.objects import ObjectUpdate
from app.services.capability_validation import validate_object_write


def merged(object_type: str, existing: dict, incoming: dict) -> dict:
    body = ObjectUpdate(properties=incoming)
    asyncio.run(
        validate_object_write(
            None,
            uuid4(),
            uuid4(),
            body,
            object_type=object_type,
            existing_properties=existing,
        )
    )
    properties = body.properties or {}
    result = {**existing, **properties}
    for key, value in properties.items():
        if value is None:
            result.pop(key, None)
    return result


def test_not_set_clears_an_application_property_and_keeps_the_rest():
    result = merged(
        "application",
        {"criticality": "medium", "lifecycle": "active"},
        {"criticality": None},
    )
    assert "criticality" not in result
    assert result["lifecycle"] == "active"


def test_a_new_criticality_replaces_the_stored_one():
    result = merged("solution", {"criticality": "medium"}, {"criticality": "high"})
    assert result["criticality"] == "high"
