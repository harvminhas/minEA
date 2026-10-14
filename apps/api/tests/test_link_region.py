import uuid

import pytest

from app.schemas.relationships import RelationshipCreate, merge_attributes
from app.services.add_batch import AddBatchRel


def _link(**attributes):
    return RelationshipCreate(
        type="runs_on",
        from_object_id=uuid.uuid4(),
        from_type="application",
        to_object_id=uuid.uuid4(),
        to_type="cloud_service",
        attributes=attributes,
    )


def test_runs_on_link_to_a_tenant_can_carry_a_region():
    assert _link(region="Canada Central").attributes == {"region": "Canada Central"}
    assert _link().attributes == {}


def test_region_must_be_short_text():
    with pytest.raises(ValueError):
        _link(region=5)
    with pytest.raises(ValueError):
        _link(region="x" * 121)


def test_merge_sets_trims_and_clears_region():
    assert merge_attributes("runs_on", {}, {"region": " ca-central-1 "}) == {"region": "ca-central-1"}
    assert merge_attributes("runs_on", {"region": "Canada East", "note": "x"}, {"region": None}) == {"note": "x"}
    assert merge_attributes("runs_on", {"region": "Canada East"}, {"region": "  "}) == {}


def test_batch_links_accept_attributes_and_default_to_none():
    assert AddBatchRel(type="runs_on", from_type="application", to_type="cloud_service").attributes == {}
    rel = AddBatchRel(type="runs_on", from_type="application", to_type="cloud_service", attributes={"region": "Canada Central"})
    assert rel.attributes["region"] == "Canada Central"
