import unittest

from app.ai.ask.graph import Edge, WorkspaceGraph
from app.ai.ask.tools import TOOLS, ToolBag, impact_of, sign_in


def _obj(obj_id: str, name: str, obj_type: str = "application", **props) -> dict:
    return {"id": obj_id, "type": obj_type, "name": name, "status": props.pop("status", "active"), "properties": props}


OBJECTS = [
    _obj("m365", "Microsoft 365", "cloud_service"),
    _obj("sf", "Salesforce"),
    _obj("ns", "NetSuite"),
    _obj("shop", "Shopify Plus"),
    _obj("exo", "Exchange Online"),
    _obj("qbo", "QuickBooks Online", sign_in="own_login"),
    _obj("old", "Old CRM", status="retired"),
    _obj("srv", "File server", "model"),
]
EDGES = [
    Edge("sf", "m365", "authenticates_via", ""),
    Edge("ns", "m365", "authenticates_via", ""),
    Edge("exo", "m365", "part_of", ""),
]


def _bag(objects=None, edges=None) -> ToolBag:
    graph = WorkspaceGraph(records={}, edges=EDGES if edges is None else edges, objects=OBJECTS if objects is None else objects)
    return ToolBag(graph=graph, seen_ids=set(), numbers=set())


class SignInToolTest(unittest.TestCase):
    def test_overview_lists_providers_own_login_and_not_recorded_apart(self) -> None:
        result = sign_in(_bag(), {})
        self.assertEqual([item["provider"]["name"] for item in result["providers"]], ["Microsoft 365"])
        self.assertEqual([user["name"] for user in result["providers"][0]["sign_in_for"]], ["NetSuite", "Salesforce"])
        self.assertEqual([item["name"] for item in result["own_login"]], ["QuickBooks Online"])
        # Not recorded: in use, not a provider or part of one, not own login. Retired apps and servers are left out.
        self.assertEqual([item["name"] for item in result["not_recorded"]], ["Shopify Plus"])
        self.assertEqual(result["not_recorded_count"], 1)
        self.assertEqual(result["links_recorded"], 2)

    def test_one_item(self) -> None:
        bag = _bag()
        provider = sign_in(bag, {"id": "m365"})
        self.assertEqual(provider["sign_in_for_count"], 2)
        self.assertEqual(provider["signs_in_with"], [])
        app = sign_in(bag, {"id": "sf"})
        self.assertEqual([item["name"] for item in app["signs_in_with"]], ["Microsoft 365"])
        self.assertFalse(app["own_login"])
        self.assertTrue(sign_in(bag, {"id": "qbo"})["own_login"])
        self.assertEqual(sign_in(bag, {"id": "nope"})["error"], "not_found")
        self.assertIn("2", bag.numbers)

    def test_a_link_beats_a_stale_own_login_flag(self) -> None:
        objects = [*OBJECTS[:5], _obj("qbo", "QuickBooks Online", sign_in="own_login")]
        result = sign_in(_bag(objects, [*EDGES, Edge("qbo", "m365", "authenticates_via", "")]), {})
        self.assertEqual(result["own_login"], [])
        self.assertEqual(result["providers"][0]["count"], 3)

    def test_impact_counts_loses_sign_in(self) -> None:
        from tests.test_ai_landscape import _orm  # noqa: F401  (same ORM shim)
        from app.ai.ask.graph import _record

        records = {}
        for obj in OBJECTS:
            rec = _record(_orm(obj), {})
            if rec:
                records[rec.id] = rec
        graph = WorkspaceGraph(records=records, edges=EDGES, objects=OBJECTS)
        result = impact_of(ToolBag(graph=graph, seen_ids=set(), numbers=set()), {"id": "m365"})
        self.assertEqual(result["counts"]["loses_sign_in"], 2)
        self.assertEqual(result["counts"]["direct"], 1)

    def test_sign_in_is_a_registered_lookup(self) -> None:
        self.assertIn("sign_in", [tool.name for tool in TOOLS])


if __name__ == "__main__":
    unittest.main()
