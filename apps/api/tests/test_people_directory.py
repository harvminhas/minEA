import asyncio
import uuid

import pytest

from app.services import people_directory as pd


class _Result:
    def __init__(self, row=None, scalar=None):
        self.row, self.scalar = row, scalar

    def mappings(self):
        return self

    def first(self):
        return self.row

    def all(self):
        return [self.row] if self.row else []

    def scalar_one(self):
        return self.scalar

    def scalar_one_or_none(self):
        return self.scalar


class FakeDb:
    def __init__(self, rows=None, existing_name_id=None):
        self.sql, self.rows, self.existing = [], rows or {}, existing_name_id
        self.committed = False

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        self.sql.append((sql, params or {}))
        if sql.startswith("SELECT * FROM"):
            return _Result(row=self.rows.get(params["id"]))
        if sql.startswith("SELECT id FROM"):
            return _Result(scalar=self.existing)
        if "RETURNING id" in sql:
            return _Result(scalar=uuid.uuid4())
        return _Result()

    async def commit(self):
        self.committed = True


WS = uuid.uuid4()


def test_names_and_duplicates():
    assert pd.clean_name("  Sales   Team ") == "Sales Team"
    rows = [{"id": "1", "name": "Sales"}, {"id": "2", "name": " sales "}, {"id": "3", "name": "Ops"}]
    assert pd.duplicate_groups(rows) == [["1", "2"]]


def test_create_reuses_existing_name():
    db = FakeDb(existing_name_id="abc")
    assert asyncio.run(pd.create(db, "team", WS, uuid.uuid4(), None, {"name": "SALES"})) == ("abc", False)
    assert not any("INSERT" in s for s, _ in db.sql)
    db = FakeDb()
    new_id, created = asyncio.run(pd.create(db, "person", WS, uuid.uuid4(), None, {"name": " Chris  B ", "email": "c@x.com"}))
    assert created and any(p.get("name") == "Chris B" for _, p in db.sql)
    with pytest.raises(ValueError):
        asyncio.run(pd.create(FakeDb(), "team", WS, uuid.uuid4(), None, {"name": "  "}))
    with pytest.raises(ValueError):
        asyncio.run(pd.create(FakeDb(), "role", WS, uuid.uuid4(), None, {"name": "X", "role_kind": "boss"}))


def test_merge_team_repoints_everything_then_deletes_source():
    rows = {"into": {"id": "into", "name": "Sales", "description": None, "lead_name": None, "lead_email": None},
            "dup": {"id": "dup", "name": "sales ", "description": "old", "lead_name": "Ann", "lead_email": None}}
    db = FakeDb(rows=rows)
    assert asyncio.run(pd.merge(db, "team", WS, "into", ["dup", "into"])) == 1
    joined = "\n".join(s for s, _ in db.sql)
    for table in pd.OWNABLE_TABLES:
        assert f"UPDATE {table} SET owner_team_id" in joined
    assert "UPDATE people_contacts SET team_id" in joined
    assert "UPDATE team_role_assignments" in joined and "people_accountabilities" in joined
    assert joined.rstrip().endswith("DELETE FROM teams WHERE id = CAST(:src AS UUID)")
    assert db.committed


def test_merge_person_fills_missing_attributes():
    rows = {"a": {"id": "a", "name": "Chris B", "email": None, "phone": None}, "b": {"id": "b", "name": "chris b", "email": "c@x.com", "phone": "555"}}
    db = FakeDb(rows=rows)
    asyncio.run(pd.merge(db, "person", WS, "a", ["b"]))
    fill = [p for s, p in db.sql if s.startswith("UPDATE people_contacts SET")]
    assert fill and fill[0]["email"] == "c@x.com" and fill[0]["phone"] == "555"


def test_rename_refuses_existing_name_and_updates_shown_names():
    rows = {"t1": {"id": "t1", "name": "Sales"}}
    with pytest.raises(ValueError):
        asyncio.run(pd.update(FakeDb(rows=rows, existing_name_id="t2"), "team", WS, "t1", {"name": "Ops"}))
    db = FakeDb(rows=rows, existing_name_id="t1")
    asyncio.run(pd.update(db, "team", WS, "t1", {"name": "Sales & Ops", "description": "x"}))
    joined = "\n".join(s for s, _ in db.sql)
    assert "UPDATE teams SET name = :name, description = :description" in joined
    assert "UPDATE objects SET owner = :name WHERE owner_team_id" in joined


def test_routes_registered_and_admin_only():
    import inspect

    from app.main import app
    from app.routers import people_directory as r
    paths = {getattr(x, "path", "") for x in app.routes}
    assert "/api/v1/orgs/{org_slug}/people-directory" in paths
    assert "/api/v1/orgs/{org_slug}/people-directory/{kind}/merge" in paths
    assert "require_org_admin" in inspect.getsource(r._admin_workspace)
