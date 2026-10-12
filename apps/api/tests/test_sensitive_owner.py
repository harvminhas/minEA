from app.schemas.relationships import ALLOWED_TRIPLES
from app.services.object_stats import merge_owner_names


def test_owns_link_wins_over_managed_by_so_card_matches_drawer():
    managed_by = {"e1": "Old ERP", "e2": "Billing"}
    owns = {"e1": "Salesforce", "e3": "Workday"}
    assert merge_owner_names(managed_by, owns) == {"e1": "Salesforce", "e2": "Billing", "e3": "Workday"}
    assert managed_by == {"e1": "Old ERP", "e2": "Billing"}


def test_agents_can_read_and_write_data_entities():
    assert ("reads", "agent", "data_object") in ALLOWED_TRIPLES
    assert ("writes", "agent", "data_object") in ALLOWED_TRIPLES
