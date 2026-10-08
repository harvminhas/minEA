"""plans.json is the one plan source; Python must agree with it (the web has a matching test)."""
import json
from pathlib import Path

import pytest

from app.services import plan_features as pf
from app.services import plans

CATALOG = json.loads((Path(plans.__file__).with_name("plans.json")).read_text(encoding="utf-8"))


def test_plan_keys_and_pack_order_come_from_json():
    assert plans.PLAN_KEYS == ("free", "starter", "team", "business")
    assert pf.PLANS == plans.PLAN_KEYS
    assert plans.PACK_ORDER == tuple(CATALOG["pack_order"]) == ("starter", "team", "business")
    assert pf.MANUAL_PLANS == ("free", "business")


@pytest.mark.parametrize(
    "plan,licences,monthly,yearly",
    [("free", 1, 0, 0), ("starter", 1, 99, 990), ("team", 5, 449, 4490), ("business", 10, 799, 7990)],
)
def test_catalogue_values(plan, licences, monthly, yearly):
    spec = plans.PLAN_CATALOG[plan]
    assert (spec["licences"], spec["monthly_usd"], spec["yearly_usd"]) == (licences, monthly, yearly)
    assert plans.plan_licences(plan) == licences


@pytest.mark.parametrize(
    "raw,expected",
    [
        (None, "free"),
        ("", "free"),
        ("free", "free"),
        ("starter", "starter"),
        ("team", "team"),
        ("business", "business"),
        ("Business", "business"),
        ("solo", "business"),
        ("growth", "business"),
        ("enterprise", "free"),
    ],
)
def test_normalize_plan_keeps_packs_distinct(raw, expected):
    assert pf.normalize_plan(raw) == expected


def test_every_paid_pack_has_business_features():
    for plan in plans.PACK_ORDER:
        assert pf.plan_allows_ai_chat(plan)
        assert pf.plan_allows_invites(plan)
        assert pf.plan_allows_share(plan, "roadmap")
        assert pf.plan_max_own_workspaces(plan) is None
        assert pf.plan_max_active_share_links(plan) == 50
    assert not pf.plan_allows_ai_chat("free")
    assert not pf.plan_allows_invites("free")


def test_pack_limits_cap_editors_at_licences():
    for plan in plans.PACK_ORDER:
        limits = pf.limits_for_plan(plan, stripe_managed=True)
        assert limits[pf.EDITOR_SEATS_KEY] == plans.plan_licences(plan)
        assert limits["max_members"] is None
        assert limits["max_workspaces"] is None
        assert limits["max_viewers"] is None


def test_free_limits_unchanged_plus_one_editor():
    limits = pf.limits_for_plan("free")
    assert limits["max_workspaces"] == 1
    assert limits["max_objects_per_workspace"] == 50
    assert limits["max_pending_invites"] == 0
    assert limits["max_admins"] == limits["max_members"] == limits["max_viewers"] == 0
    assert limits["max_active_share_links"] == 1
    assert limits[pf.EDITOR_SEATS_KEY] == 1


def test_business_without_stripe_is_legacy_with_unchanged_limits_and_no_cap():
    limits = pf.limits_for_plan("business")
    assert limits["max_members"] == 10
    assert limits["max_workspaces"] is None
    assert limits["max_objects_per_workspace"] is None
    assert limits["max_active_share_links"] == 50
    assert limits["max_pending_invites"] == 50
    assert limits[pf.EDITOR_SEATS_KEY] is None
    assert pf.is_legacy_business("business", None)
    assert pf.is_legacy_business("solo", None)
    assert not pf.is_legacy_business("business", "sub_123")
    assert not pf.is_legacy_business("team", None)


def test_lookup_keys_round_trip():
    assert plans.lookup_key_for("team", "yearly") == "bubomap_team_yearly"
    for plan in plans.PACK_ORDER:
        for interval in plans.INTERVALS:
            assert plans.parse_lookup_key(plans.lookup_key_for(plan, interval)) == (plan, interval)
    assert plans.parse_lookup_key("bubomap_free_monthly") is None
    assert plans.parse_lookup_key("other_team_monthly") is None
    assert plans.parse_lookup_key(None) is None
    with pytest.raises(ValueError):
        plans.lookup_key_for("free", "monthly")


def test_unit_amounts_are_cents():
    assert plans.unit_amount_cents("starter", "monthly") == 9900
    assert plans.unit_amount_cents("business", "yearly") == 799000


@pytest.mark.parametrize(
    "used,variant",
    [(0, "all"), (1, "all"), (2, "team_up"), (5, "team_up"), (6, "business_only"), (10, "business_only"), (14, "business_only")],
)
def test_portal_variant_never_offers_a_pack_too_small(used, variant):
    assert plans.portal_variant_for_licences(used) == variant
