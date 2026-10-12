import asyncio
from uuid import uuid4

from app.schemas.objects import ObjectCreate
from app.schemas.relationships import ALLOWED_TRIPLES
from app.services.capability_validation import validate_object_write


def test_capability_without_a_domain_is_valid():
    body = ObjectCreate(type="capability", name="Accounting", properties={})
    # No DB access is needed when there is no domain to look up.
    asyncio.run(validate_object_write(None, uuid4(), uuid4(), body, object_type="capability"))  # type: ignore[arg-type]


def test_capabilities_can_be_supported_by_platforms():
    assert ("supported_by", "capability", "cloud_service") in ALLOWED_TRIPLES
    assert ("supported_by", "capability", "application") in ALLOWED_TRIPLES
