import unittest

from app.ai.ask.impact import RULES, RISK_EDGE_TYPES, ImpactEdge, impact_of


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
            ImpactEdge("depends_on", "cs", "sf"),
            ImpactEdge("part_of", "mkt", "sf"),
            ImpactEdge("part_of", "sm", "sf"),
            ImpactEdge("part_of", "m360", "sf"),
            ImpactEdge("supported_by", "mc", "mkt"),
            ImpactEdge("replaces", "next", "sf"),
            ImpactEdge("depends_on", "cs", "sf"),
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

    def test_depends_on_chain(self) -> None:
        names = {"a": "A", "b": "B", "c": "C"}
        edges = [ImpactEdge("depends_on", "a", "b"), ImpactEdge("depends_on", "b", "c")]
        hits = {hit["name"]: hit for hit in impact_of(names, edges, "c")}
        self.assertEqual(hits["B"]["severity"], "direct")
        self.assertFalse(hits["B"]["indirect"])
        self.assertEqual(hits["A"]["severity"], "direct")
        self.assertTrue(hits["A"]["indirect"])
        self.assertEqual(
            ", then ".join(step["label"] for step in hits["A"]["path"]),
            "B depends on C, then A depends on B",
        )
        self.assertEqual(len(hits), 2)

    def test_calls_and_hosts_have_no_lane(self) -> None:
        names = {"a": "A", "b": "B"}
        self.assertEqual(impact_of(names, [ImpactEdge("calls", "a", "b")], "b"), [])
        self.assertEqual(impact_of(names, [ImpactEdge("hosts", "a", "b")], "a"), [])

    def test_rules_match_the_shared_json(self) -> None:
        import json
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[3]
            / "packages"
            / "types"
            / "src"
            / "impact-rules.json"
        )
        loaded = json.loads(path.read_text(encoding="utf-8"))
        risk = loaded.pop("_risk")
        self.assertEqual(risk, list(RISK_EDGE_TYPES))
        mapped = {}
        for rel_type, rule in RULES.items():
            lane = {}
            if rule.get("when_target_fails"):
                lane["whenTargetFails"] = rule["when_target_fails"]
            if rule.get("when_source_fails"):
                lane["whenSourceFails"] = rule["when_source_fails"]
            mapped[rel_type] = lane
        self.assertEqual(mapped, loaded)

    def test_labels_match_the_label_map(self) -> None:
        import re
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[3]
            / "packages"
            / "types"
            / "src"
            / "relationship-labels.ts"
        )
        source = path.read_text(encoding="utf-8")
        found = re.findall(
            r'^\s+(\w+): label\("[^"]+", "[^"]+", \(from, to\) => `\$\{from\} ([^`]+) \$\{to\}`\)',
            source,
            re.M,
        )
        self.assertGreater(len(found), 30)
        middles = dict(found)
        for rel_type, rule in RULES.items():
            self.assertEqual(rule["label"], "{source} " + middles[rel_type] + " {target}")

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
