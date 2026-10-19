"""The Annual cost quick box in record tables sends one flat annual estimate line; the server must accept it."""
from app.services.cost_lines import apply_cost_lines

QUICK_LINE = {
    "id": "l1",
    "type": "subscription",
    "amount_cents": 120000,
    "frequency": "annual",
    "calculation": {"kind": "flat"},
    "vendor": None,
    "source": "estimate",
    "created_at": "2026-10-19T00:00:00Z",
    "created_by": "u",
    "updated_at": "2026-10-19T00:00:00Z",
    "updated_by": "u",
}


def test_quick_line_validates_and_sets_annual_cost_for_every_table_kind():
    for object_type in ("application", "solution", "model", "cloud_service"):
        props = apply_cost_lines(object_type, {"category": "Security", "cost_lines": [dict(QUICK_LINE)]})
        assert props["cost_lines"][0]["amount_cents"] == 120000
        assert props["category"] == "Security"
        assert props.get("annual_cost") in (1200, 1200.0, "1200", "1200.0", "$1,200")


def test_quick_line_is_added_next_to_existing_lines():
    other = {**QUICK_LINE, "id": "l0", "type": "hosting", "amount_cents": 30000}
    props = apply_cost_lines("application", {"cost_lines": [other, dict(QUICK_LINE)]})
    assert [line["id"] for line in props["cost_lines"]] == ["l0", "l1"]
