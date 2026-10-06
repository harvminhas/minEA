import unittest
from datetime import datetime

from sqlalchemy import create_engine, text

from app.services.relationship_type_fix import (
    FixEdge,
    PartyRef,
    VendorText,
    apply_actions,
    plan_fixes,
    plan_vendor_backfill,
)


def edge(edge_id: str, rel_type: str, from_type: str, to_type: str, day: int, **names) -> FixEdge:
    return FixEdge(
        id=edge_id,
        org_id="org-1",
        workspace_id="ws-1",
        org_slug="acme",
        ws_slug="default",
        type=rel_type,
        from_id=names.get("from_id", f"from-{edge_id}"),
        from_type=from_type,
        from_name=names.get("from_name", f"From {edge_id}"),
        to_id=names.get("to_id", f"to-{edge_id}"),
        to_type=to_type,
        to_name=names.get("to_name", f"To {edge_id}"),
        created_at=datetime(2020, 1, day),
        from_vendor=names.get("from_vendor", ""),
    )


def seed() -> list[FixEdge]:
    return [
        edge("a", "runs_on", "application", "application", 1, from_name="M365", to_name="D365"),
        edge(
            "b", "built_on", "cloud_service", "application", 2,
            from_name="Platform", to_name="App",
        ),
        edge("c", "calls", "application", "application", 3, from_name="Caller", to_name="Callee"),
        edge(
            "d", "affects", "initiative", "application", 4,
            from_name="Old initiative", to_name="App",
        ),
        edge(
            "e1", "located_at", "model", "location", 5,
            from_id="as400", from_name="AS400", to_id="loc", to_name="Plant",
        ),
        edge(
            "e2", "located_at", "model", "location", 6,
            from_id="as400", from_name="AS400", to_id="loc", to_name="Plant",
        ),
        edge(
            "f1", "built_on", "application", "cloud_service", 7,
            from_id="erp", from_name="ERP", to_id="p1", to_name="One",
        ),
        edge(
            "f2", "built_on", "application", "cloud_service", 8,
            from_id="erp", from_name="ERP", to_id="p2", to_name="Two",
        ),
        edge(
            "keep", "runs_on", "application", "cloud_service", 9,
            from_name="Order Entry", to_name="AS400",
        ),
        edge("g", "exposes", "application", "tool", 10, from_name="App", to_name="Gateway"),
    ]


def snapshot(edges: list[FixEdge]) -> set[tuple]:
    return {
        (item.id, item.type, item.from_id, item.from_type, item.to_id, item.to_type)
        for item in edges
    }


class FixRelationshipTypesTests(unittest.TestCase):
    def test_dry_run_plans_each_case_and_apply_is_idempotent(self):
        engine = create_engine("sqlite://")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE relationships (
                        id TEXT PRIMARY KEY,
                        type TEXT,
                        from_id TEXT,
                        from_type TEXT,
                        to_id TEXT,
                        to_type TEXT
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE change_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        relationship_id TEXT,
                        code TEXT,
                        diff TEXT
                    )
                    """
                )
            )
            for item in seed():
                conn.execute(
                    text(
                        """
                        INSERT INTO relationships (id, type, from_id, from_type, to_id, to_type)
                        VALUES (:id, :type, :from_id, :from_type, :to_id, :to_type)
                        """
                    ),
                    {
                        "id": item.id,
                        "type": item.type,
                        "from_id": item.from_id,
                        "from_type": item.from_type,
                        "to_id": item.to_id,
                        "to_type": item.to_type,
                    },
                )

        before = seed()
        stored = self._read(engine)
        self.assertEqual(snapshot(stored), snapshot(before))

        actions = plan_fixes(before)
        self.assertEqual(snapshot(self._read(engine)), snapshot(before))
        by_code = {}
        for action in actions:
            by_code.setdefault(action.code, set()).add(action.edge_id)
        self.assertEqual(by_code["a"], {"a"})
        self.assertEqual(by_code["b"], {"b"})
        self.assertEqual(by_code["c"], {"c"})
        self.assertEqual(by_code["d"], {"d"})
        self.assertEqual(by_code["e"], {"e2"})
        self.assertEqual(by_code["f"], {"f1", "f2"})
        self.assertEqual(by_code["g"], {"g"})
        self.assertNotIn("keep", {action.edge_id for action in actions})
        expected = "acme/default | M365 -[runs_on]-> D365 | change to depends_on"
        self.assertTrue(any(action.line == expected for action in actions))

        updated, logs = apply_actions(before, actions)
        self._write(engine, updated, logs)
        rows = {item.id: item for item in self._read(engine)}
        self.assertEqual(rows["a"].type, "depends_on")
        self.assertEqual(rows["b"].from_type, "application")
        self.assertEqual(rows["b"].to_type, "cloud_service")
        self.assertEqual(rows["b"].type, "built_on")
        self.assertEqual(rows["c"].type, "depends_on")
        self.assertEqual(rows["d"].type, "affects")
        self.assertNotIn("e2", rows)
        self.assertEqual(rows["e1"].type, "located_at")
        self.assertEqual(rows["f1"].to_id, "p1")
        self.assertEqual(rows["f2"].to_id, "p2")
        self.assertEqual(rows["keep"].type, "runs_on")
        self.assertEqual(rows["g"].type, "exposes")
        with engine.connect() as conn:
            logged = conn.execute(
                text("SELECT code FROM change_log ORDER BY relationship_id")
            ).all()
        self.assertEqual(sorted(code for (code,) in logged), ["a", "b", "c", "e"])

        again = plan_fixes(self._read(engine))
        self.assertEqual([action.kind for action in again if action.kind != "report"], [])
        self.assertEqual({action.code for action in again}, {"d", "f", "g"})

    def test_exact_duplicate_is_reported_and_removed(self):
        edges = [
            edge(
                "e1", "located_at", "model", "location", 5,
                from_id="as400", from_name="AS400", to_id="east", to_name="AWS us-east-1",
            ),
            edge(
                "e2", "located_at", "model", "location", 6,
                from_id="as400", from_name="AS400", to_id="east", to_name="AWS us-east-1",
            ),
        ]
        actions = plan_fixes(edges)
        deletes = [action for action in actions if action.kind == "delete"]
        self.assertEqual([action.edge_id for action in deletes], ["e2"])
        self.assertIn("exact duplicate", deletes[0].line)
        updated, _logs = apply_actions(edges, actions)
        self.assertEqual([item.id for item in updated], ["e1"])
        again = [action for action in plan_fixes(updated) if action.kind == "delete"]
        self.assertEqual(again, [])

    def test_sends_data_to_vendor_becomes_supplied_by_or_is_deleted(self):
        lone = edge(
            "s1", "sends_data_to", "application", "external_party", 1,
            from_id="m365", from_name="Microsoft 365", to_id="ms", to_name="Microsoft",
        )
        extra = edge(
            "s2", "sends_data_to", "application", "external_party", 2,
            from_id="m365", from_name="Microsoft 365", to_id="other", to_name="Other",
        )
        linked = edge(
            "s3", "sends_data_to", "application", "external_party", 3,
            from_id="d365", from_name="Dynamics", to_id="ms", to_name="Microsoft",
        )
        have = edge(
            "v", "supplied_by", "application", "external_party", 1,
            from_id="d365", from_name="Dynamics", to_id="ms", to_name="Microsoft",
        )
        actions = plan_fixes([lone, extra, linked, have])
        by_id = {action.edge_id: action for action in actions if action.code == "h"}
        self.assertEqual(by_id["s1"].kind, "set_type")
        self.assertEqual(by_id["s1"].type, "supplied_by")
        self.assertEqual(by_id["s1"].vendor_name, "Microsoft")
        self.assertEqual(by_id["s2"].kind, "delete")
        self.assertEqual(by_id["s3"].kind, "delete")
        updated, _logs = apply_actions([lone, extra, linked, have], actions)
        types = {item.id: item.type for item in updated}
        self.assertEqual(types["s1"], "supplied_by")
        self.assertEqual(types["v"], "supplied_by")
        self.assertNotIn("s2", types)
        self.assertNotIn("s3", types)
        again = [action for action in plan_fixes(updated) if action.code == "h"]
        self.assertEqual(again, [])

    def test_vendor_property_is_left_when_it_names_someone_else(self):
        different = edge(
            "s1", "sends_data_to", "application", "external_party", 1,
            from_id="edi", from_name="EDI", to_id="ms", to_name="Microsoft",
            from_vendor="Salesforce",
        )
        same = edge(
            "s2", "sends_data_to", "application", "external_party", 2,
            from_id="mail", from_name="Mail", to_id="ms", to_name="Microsoft",
            from_vendor="microsoft",
        )
        actions = {action.edge_id: action for action in plan_fixes([different, same])}
        self.assertEqual(actions["s1"].vendor_name, "")
        self.assertIn("left properties.vendor (Salesforce)", actions["s1"].line)
        self.assertEqual(actions["s2"].vendor_name, "Microsoft")
        self.assertNotIn("left properties.vendor", actions["s2"].line)

    def test_text_vendor_without_a_link_is_backfilled(self):
        record = VendorText(
            id="hub",
            org_id="org-1",
            workspace_id="ws-1",
            org_slug="acme",
            ws_slug="default",
            type="cloud_service",
            name="QA Plat 3",
            vendor="HubSpot",
        )
        missing = plan_vendor_backfill([record], [], [])
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0].vendor_name, "HubSpot")
        self.assertEqual(missing[0].party_id, "")
        self.assertIn("backfill supplied_by HubSpot", missing[0].line)
        matched = plan_vendor_backfill(
            [record],
            [],
            [PartyRef(id="party-1", workspace_id="ws-1", name="hubspot")],
        )
        self.assertEqual(matched[0].party_id, "party-1")
        linked = edge(
            "have", "supplied_by", "cloud_service", "external_party", 1,
            from_id="hub", from_name="QA Plat 3", to_name="HubSpot",
        )
        self.assertEqual(plan_vendor_backfill([record], [linked], []), [])

    def test_conversion_already_supplies_the_item_so_text_vendor_is_skipped(self):
        send = edge(
            "s1", "sends_data_to", "application", "external_party", 1,
            from_id="edi", from_name="EDI", to_id="mule", to_name="Mulesoft",
            from_vendor="Salesforce",
        )
        actions = plan_fixes([send])
        planned, _logs = apply_actions([send], actions)
        self.assertEqual(planned[0].type, "supplied_by")
        record = VendorText(
            id="edi",
            org_id="org-1",
            workspace_id="ws-1",
            org_slug="acme",
            ws_slug="default",
            type="application",
            name="EDI",
            vendor="Salesforce",
        )
        self.assertEqual(plan_vendor_backfill([record], planned, []), [])

    def test_vendor_text_is_cleaned_before_backfill(self):
        def record(vendor: str) -> VendorText:
            return VendorText(
                id="plat",
                org_id="org-1",
                workspace_id="ws-1",
                org_slug="acme",
                ws_slug="default",
                type="cloud_service",
                name="QA Plat 3",
                vendor=vendor,
            )

        microsoft = plan_vendor_backfill(
            [record("microsoft")],
            [],
            [PartyRef(id="ms", workspace_id="ws-1", name="Microsoft")],
        )
        self.assertEqual(len(microsoft), 1)
        self.assertEqual(microsoft[0].vendor_name, "Microsoft")
        self.assertEqual(microsoft[0].party_id, "ms")
        self.assertEqual(plan_vendor_backfill([record("other")], [], []), [])
        self.assertEqual(plan_vendor_backfill([record("on_premise")], [], []), [])

    def _read(self, engine) -> list[FixEdge]:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, type, from_id, from_type, to_id, to_type FROM relationships"
                )
            ).all()
        by_id = {item.id: item for item in seed()}
        loaded = []
        for row in rows:
            original = by_id[row.id]
            loaded.append(
                FixEdge(
                    id=row.id,
                    org_id=original.org_id,
                    workspace_id=original.workspace_id,
                    org_slug=original.org_slug,
                    ws_slug=original.ws_slug,
                    type=row.type,
                    from_id=row.from_id,
                    from_type=row.from_type,
                    from_name=original.from_name,
                    to_id=row.to_id,
                    to_type=row.to_type,
                    to_name=original.to_name,
                    created_at=original.created_at,
                )
            )
        return loaded

    def _write(self, engine, edges: list[FixEdge], logs: list[dict]) -> None:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM relationships"))
            for item in edges:
                conn.execute(
                    text(
                        """
                        INSERT INTO relationships (id, type, from_id, from_type, to_id, to_type)
                        VALUES (:id, :type, :from_id, :from_type, :to_id, :to_type)
                        """
                    ),
                    {
                        "id": item.id,
                        "type": item.type,
                        "from_id": item.from_id,
                        "from_type": item.from_type,
                        "to_id": item.to_id,
                        "to_type": item.to_type,
                    },
                )
            for entry in logs:
                conn.execute(
                    text(
                        "INSERT INTO change_log (relationship_id, code, diff) "
                        "VALUES (:id, :code, :diff)"
                    ),
                    {
                        "id": entry["diff"]["relationship_id"],
                        "code": entry["diff"]["code"],
                        "diff": str(entry["diff"]),
                    },
                )


if __name__ == "__main__":
    unittest.main()
