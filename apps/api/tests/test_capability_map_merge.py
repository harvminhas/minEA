from types import SimpleNamespace
from uuid import uuid4

from app.routers.capability_map import _map_to_read
from app.services.capability_map import NO_DOMAIN_ID, plan_template_merge


def _obj(name, **props):
    return SimpleNamespace(id=uuid4(), name=name, properties=props, status="active", owner=None)


def test_capabilities_without_a_domain_show_in_a_no_domain_card():
    sell = _obj("Sell")
    crm = _obj("CRM", domain_id=str(sell.id))
    loose = _obj("Payroll")
    dangling = _obj("Orphan", domain_id=str(uuid4()))
    read = _map_to_read([sell], [crm, loose, dangling], {})
    assert [d.name for d in read.domains] == ["Sell", "No domain"]
    assert read.domains[-1].id == NO_DOMAIN_ID
    assert [c.name for c in read.domains[-1].capabilities] == ["Orphan", "Payroll"]
    assert read.initialized


def test_no_domain_card_only_when_needed():
    sell = _obj("Sell")
    assert [d.name for d in _map_to_read([sell], [], {}).domains] == ["Sell"]


def test_template_merges_into_leftover_domains():
    template = {"domains": [
        {"name": "Customer", "icon": "users", "capabilities": ["Acquisition", "Support"]},
        {"name": "Finance", "icon": "coins", "capabilities": ["Billing"]},
    ]}
    plan = plan_template_merge(template, [("d1", "customer")], {"d1": {"support"}})
    assert plan[0][0] == "d1" and plan[0][2] == ["Acquisition"]
    assert plan[1][0] is None and plan[1][2] == ["Billing"]
