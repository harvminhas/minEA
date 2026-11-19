from app.services.owner_side_links import extra_owner_side_links, owner_entity_ids_with_accountability


def test_owns_accountability_suppresses_column_fallback():
    acc = [{"entity_kind": "capability", "entity_id": "cap-1", "link_kind": "owns", "subject_type": "contact", "subject_id": "c1"}]
    objects = [
        {
            "id": "cap-1",
            "type": "capability",
            "point_of_contact_id": "c-legacy",
            "point_of_contact_name": "Legacy",
            "owner_team_id": "t-legacy",
        }
    ]
    assert owner_entity_ids_with_accountability(acc) == {"cap-1"}
    assert extra_owner_side_links(
        objects=objects,
        accountabilities=acc,
        contact_names={},
        team_names={},
    ) == []


def test_fallback_emits_ids_only_when_no_owns_row():
    objects = [
        {
            "id": "dom-1",
            "type": "business_domain",
            "point_of_contact_id": "c1",
            "point_of_contact_name": "Priya Shah",
        },
        {"id": "cap-2", "type": "capability", "owner": "Text only"},
        {"id": "app-1", "type": "application", "point_of_contact_id": "c9"},
    ]
    role_rows = [
        {
            "link_kind": "business_owner",
            "entity_id": "cap-3",
            "subject_type": "contact",
            "subject_id": "c2",
        }
    ]
    links = extra_owner_side_links(
        objects=objects + [{"id": "cap-3", "type": "capability"}],
        accountabilities=[{"entity_kind": "capability", "entity_id": "cap-3", "link_kind": "informed", "subject_id": "c9"}],
        role_rows=role_rows,
        contact_names={"c2": "Alex Rivera"},
        team_names={},
    )
    by_on = {item["on"]: item for item in links}
    assert by_on["dom-1"]["id"] == "c1"
    assert by_on["dom-1"]["relationship"] == "owns"
    assert by_on["cap-3"]["name"] == "Alex Rivera"
    assert "cap-2" not in by_on
    assert "app-1" not in by_on
