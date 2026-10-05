import unittest
from datetime import datetime

from sqlalchemy import create_engine, text

from app.services.relationship_type_fix import FixEdge, apply_actions, plan_fixes


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
