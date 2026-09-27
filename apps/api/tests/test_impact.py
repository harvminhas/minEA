import unittest

from app.ai.ask.impact import ImpactEdge, impact_of


class ImpactTests(unittest.TestCase):
    def test_salesforce(self) -> None:
        names = {
            "sf": "SalesForce CRM",
            "cs": "Customer Service",
            "mkt": "Marketing",
            "sm": "Sales Module",
            "m360": "My 360",
            "mc": "Marketing Campaigns",
            "next": "New CRM",
        }
        edges = [
            ImpactEdge("calls", "cs", "sf"),
            ImpactEdge("part_of", "mkt", "sf"),
            ImpactEdge("part_of", "sm", "sf"),
            ImpactEdge("part_of", "m360", "sf"),
            ImpactEdge("supported_by", "mc", "mkt"),
            ImpactEdge("replaces", "next", "sf"),
            ImpactEdge("calls", "cs", "sf"),
        ]
        hits = {hit["name"]: hit for hit in impact_of(names, edges, "sf")}
        for name in ("Customer Service", "Marketing", "Sales Module", "My 360"):
            self.assertEqual(hits[name]["severity"], "direct")
            self.assertFalse(hits[name]["indirect"])
        self.assertEqual(hits["Marketing"]["path"][0]["label"], "Marketing is part of SalesForce CRM")
        self.assertEqual(hits["Marketing Campaigns"]["severity"], "loses_support")
        self.assertNotIn("New CRM", hits)
        self.assertEqual(sum(1 for hit in hits if hit == "Customer Service"), 1)

    def test_replaces_never_propagates(self) -> None:
        names = {"old": "Old CRM", "new": "New CRM"}
        edges = [ImpactEdge("replaces", "new", "old")]
        self.assertEqual(impact_of(names, edges, "old"), [])
        self.assertEqual(impact_of(names, edges, "new"), [])

    def test_calls_chain(self) -> None:
        names = {"a": "A", "b": "B", "c": "C"}
        edges = [ImpactEdge("calls", "a", "b"), ImpactEdge("calls", "b", "c")]
        hits = {hit["name"]: hit for hit in impact_of(names, edges, "c")}
        self.assertEqual(hits["B"]["severity"], "direct")
        self.assertFalse(hits["B"]["indirect"])
        self.assertEqual(hits["A"]["severity"], "direct")
        self.assertTrue(hits["A"]["indirect"])
        self.assertEqual(
            ", then ".join(step["label"] for step in hits["A"]["path"]),
            "B calls C, then A calls B",
        )
        self.assertEqual(len(hits), 2)

    def test_as400_fixture(self) -> None:
        names = {
            "as400": "AS400",
            "oe": "Order Entry",
            "inv": "Inventory",
            "edi": "EDI Gateway",
            "legacy": "Legacy box",
        }
        edges = [
            ImpactEdge("runs_on", "oe", "as400"),
            ImpactEdge("runs_on", "inv", "as400"),
            ImpactEdge("runs_on", "edi", "as400"),
            ImpactEdge("replaces", "legacy", "as400"),
        ]
        hits = impact_of(names, edges, "as400")
        self.assertEqual([hit["name"] for hit in hits], ["EDI Gateway", "Inventory", "Order Entry"])
        self.assertTrue(all(hit["severity"] == "direct" and hit["indirect"] is False for hit in hits))
        self.assertEqual(hits[0]["path"][0]["label"], "EDI Gateway runs on AS400")


if __name__ == "__main__":
    unittest.main()
