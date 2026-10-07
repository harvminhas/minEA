import pytest
from fastapi import HTTPException

from app.services.ai_features import DANGLING_COST_LINE, apply_ai_features
from app.services.cost_lines import apply_cost_lines
from app.services.type_switch import properties_for_type


def feature(key: str = "m365-copilot", **extra) -> dict:
    return {
        "key": key,
        "name": "Microsoft 365 Copilot",
        "status": "on",
        "sees_company_data": "yes",
        "vendor_trains": "no",
        "source": "catalog",
        **extra,
    }


def seat_line(line_id: str = "ai-m365-copilot") -> dict:
    return {
        "id": line_id,
        "type": "subscription",
        "frequency": "annual",
        "calculation": {"kind": "per_user", "seats": 10, "unit_price_monthly_cents": 2100},
        "vendor": "Microsoft",
        "source": "estimate",
        "ai_feature": "m365-copilot",
    }


def fails(object_type: str, properties: dict, **kwargs) -> str:
    with pytest.raises(HTTPException) as exc:
        apply_ai_features(object_type, properties, **kwargs)
    assert exc.value.status_code == 400
    return exc.value.detail


def test_a_valid_feature_list_is_kept():
    props = apply_ai_features("application", {"ai_features": [feature()], "holds_data": ["customer", "customer"]})
    assert props["ai_features"][0]["key"] == "m365-copilot"
    assert props["holds_data"] == ["customer"]


@pytest.mark.parametrize(
    "bad",
    [
        {"status": "maybe"},
        {"sees_company_data": "sometimes"},
        {"vendor_trains": None},
        {"audience": "partners"},
        {"key": " "},
        {"name": ""},
    ],
)
def test_bad_values_fail_with_400(bad):
    fails("application", {"ai_features": [feature(**bad)]})


def test_a_feature_listed_twice_fails():
    fails("cloud_service", {"ai_features": [feature(), feature(status="off")]})


def test_a_dangling_cost_line_fails_with_the_message():
    detail = fails("application", {"ai_features": [feature(cost_line_id="gone")], "cost_lines": [seat_line()]})
    assert detail == DANGLING_COST_LINE


def test_a_cost_line_on_the_record_passes():
    props = apply_ai_features(
        "application",
        apply_cost_lines("application", {"ai_features": [feature(cost_line_id="ai-m365-copilot")], "cost_lines": [seat_line()]}),
    )
    assert props["ai_features"][0]["cost_line_id"] == "ai-m365-copilot"
    assert props["cost_lines"][0]["ai_feature"] == "m365-copilot"
    assert props["annual_cost"] == 2520


def test_deleting_the_line_elsewhere_clears_the_pointer_instead_of_failing():
    props = apply_ai_features(
        "application",
        {"ai_features": [feature(cost_line_id="ai-m365-copilot")], "cost_lines": []},
        strict=False,
    )
    assert props["ai_features"][0]["cost_line_id"] is None


def test_ai_features_on_a_server_fail():
    fails("model", {"ai_features": [feature()]})
    fails("agent", {"holds_data": ["customer"]})


def test_a_server_without_ai_keys_is_untouched():
    assert apply_ai_features("model", {"os": "linux"}) == {"os": "linux"}


def test_an_empty_list_deletes_the_key():
    props = apply_ai_features("application", {"ai_features": [], "holds_data": [], "vendor": "Microsoft"})
    assert props == {"vendor": "Microsoft"}


def test_bad_holds_data_fails():
    fails("application", {"holds_data": ["secrets"]})
    fails("application", {"holds_data": ["none", "customer"]})
    fails("application", {"holds_data": "customer"})


def test_a_bad_ai_feature_tag_on_a_cost_line_fails():
    line = {**seat_line(), "ai_feature": 7}
    with pytest.raises(HTTPException):
        apply_cost_lines("application", {"cost_lines": [line]})


def test_type_switch_drops_ai_keys_for_a_server_and_keeps_them_for_a_platform():
    props = {"ai_features": [feature()], "holds_data": ["financial"], "vendor": "Microsoft"}
    assert "ai_features" not in properties_for_type("model", props)
    assert "holds_data" not in properties_for_type("model", props)
    kept = properties_for_type("cloud_service", props)
    assert kept["ai_features"][0]["key"] == "m365-copilot"
    assert kept["holds_data"] == ["financial"]
