import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi import Response
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert

from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.routers.relationships import create_relationship, delete_relationship
from app.schemas.relationships import RelationshipCreate
from app.services.add_batch import AddBatchRel, AddBatchRequest, apply_add_batch
from app.services.relationship_write import relationship_http_status, save_relationship, without_vendor_text


class _Result:
    def __init__(self, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = list(rows or [])

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return self

    def all(self):
        return self._rows


def _rel(**overrides) -> Relationship:
    values = {
        "id": uuid4(),
        "workspace_id": uuid4(),
        "org_id": uuid4(),
        "type": "supplied_by",
        "from_object_id": uuid4(),
        "from_type": "application",
        "to_object_id": uuid4(),
        "to_type": "external_party",
        "attributes": {},
        "created_by": None,
        "created_at": datetime.now(timezone.utc),
    }
    values.update(overrides)
    return Relationship(**values)


class _InsertSession:
    """First execute is the insert. A later execute is the conflict re-select."""

    def __init__(self, inserted: Relationship | None, existing: list[Relationship]):
        self.inserted = inserted
        self.existing = existing
        self.calls = 0
        self.statements = []

    async def execute(self, stmt):
        self.statements.append(stmt)
        self.calls += 1
        if self.calls == 1:
            return _Result(scalar=None if self.inserted is None else self.inserted.id)
        return _Result(rows=self.existing)

    async def get(self, model, ident):
        if self.inserted is None or self.inserted.id != ident:
            return None
        return self.inserted


def _insert_sql(session: _InsertSession) -> str:
    compiled = session.statements[0].compile(dialect=postgresql.dialect())
    return str(compiled)


class SaveRelationshipTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_pair_is_created(self):
        stored = _rel()
        session = _InsertSession(stored, [])
        row, created = await save_relationship(session, _rel(
            id=stored.id,
            workspace_id=stored.workspace_id,
            org_id=stored.org_id,
            from_object_id=stored.from_object_id,
            to_object_id=stored.to_object_id,
        ))
        self.assertTrue(created)
        self.assertIs(row, stored)
        self.assertEqual(relationship_http_status(created), 201)
        self.assertIn("ON CONFLICT", _insert_sql(session))

    async def test_conflict_returns_the_existing_row(self):
        kept = _rel()
        session = _InsertSession(None, [kept])
        row, created = await save_relationship(session, _rel(
            workspace_id=kept.workspace_id,
            org_id=kept.org_id,
            type=kept.type,
            from_object_id=kept.from_object_id,
            to_object_id=kept.to_object_id,
        ))
        self.assertFalse(created)
        self.assertIs(row, kept)
        self.assertEqual(relationship_http_status(created), 200)
        self.assertIn("ON CONFLICT", _insert_sql(session))


class _WorkspaceDb:
    def __init__(self, from_id, to_id):
        self.from_id = from_id
        self.to_id = to_id
        self.rows: list[Relationship] = []

    async def execute(self, stmt, params=None):
        sql = str(stmt).lower()
        if "catalog_dirty" in sql:
            return _Result()
        if isinstance(stmt, Insert):
            match = next(
                (
                    row for row in self.rows
                    if row.type == "depends_on"
                    and row.from_object_id == self.from_id
                    and row.to_object_id == self.to_id
                ),
                None,
            )
            if match is not None:
                return _Result(scalar=None)
            row = _rel(
                type="depends_on",
                from_type="application",
                to_type="application",
                from_object_id=self.from_id,
                to_object_id=self.to_id,
                workspace_id=self.rows[0].workspace_id if self.rows else uuid4(),
            )
            self.rows.append(row)
            return _Result(scalar=row.id)
        if "relationships" in sql:
            return _Result(rows=list(self.rows))
        return _Result(scalar=self.from_id)

    async def get(self, model, ident):
        return next((row for row in self.rows if row.id == ident), None)


class RouterRepeatTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_then_repeat_is_201_then_200(self):
        workspace_id = uuid4()
        org_id = uuid4()
        user_id = uuid4()
        from_id = uuid4()
        to_id = uuid4()
        db = _WorkspaceDb(from_id, to_id)
        ctx = SimpleNamespace(
            workspace=SimpleNamespace(id=workspace_id),
            org_id=org_id,
            user_id=user_id,
        )

        async def allow(db, permission):
            return None

        ctx.require_permission = allow
        body = RelationshipCreate(
            type="depends_on",
            from_object_id=from_id,
            from_type="application",
            to_object_id=to_id,
            to_type="application",
        )
        first_response = Response()
        created = await create_relationship(body, first_response, ctx, db)
        self.assertEqual(first_response.status_code, 201)
        second_response = Response()
        again = await create_relationship(body, second_response, ctx, db)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(created.id, again.id)
        self.assertEqual(len(db.rows), 1)


class _ConflictSession:
    def __init__(self, existing: Relationship):
        self.existing = existing
        self.calls = 0

    async def execute(self, stmt):
        self.calls += 1
        if self.calls == 1:
            return _Result(scalar=None)
        return _Result(rows=[self.existing])

    async def get(self, model, ident):
        raise AssertionError("an existing link is not loaded by id")


class AddBatchExistingLinkTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_link_is_returned_and_not_recorded_as_created(self):
        existing = _rel(type="depends_on", from_type="application", to_type="application")
        body = AddBatchRequest(
            relationships=[
                AddBatchRel(
                    type="depends_on",
                    from_id=existing.from_object_id,
                    to_id=existing.to_object_id,
                    from_type="application",
                    to_type="application",
                )
            ]
        )

        async def to_read(db, obj):
            raise AssertionError("no objects")

        result = await apply_add_batch(
            _ConflictSession(existing),
            workspace_id=existing.workspace_id,
            org_id=existing.org_id,
            user_id=uuid4(),
            body=body,
            to_read=to_read,
        )
        self.assertEqual(result.created_relationship_ids, [])
        self.assertEqual(len(result.relationships), 1)
        self.assertEqual(result.relationships[0].id, existing.id)


class _DeleteDb:
    def __init__(self, rel, source):
        self.rel = rel
        self.source = source
        self.deleted = []

    async def execute(self, stmt, params=None):
        sql = str(stmt).lower()
        if "catalog_dirty" in sql:
            return _Result()
        if "relationships" in sql:
            return _Result(scalar=self.rel)
        if "objects" in sql:
            return _Result(scalar=self.source)
        return _Result()

    async def delete(self, row):
        self.deleted.append(row)

    async def flush(self):
        return None


class SuppliedByDeleteTests(unittest.IsolatedAsyncioTestCase):
    async def test_removing_supplied_by_clears_the_stored_vendor_text(self):
        self.assertEqual(without_vendor_text({"vendor": "Oracle", "category": "ERP"}), {"category": "ERP"})
        rel = _rel(type="supplied_by")
        source = MinEAObject(
            id=rel.from_object_id,
            workspace_id=rel.workspace_id,
            org_id=rel.org_id,
            type="application",
            name="EDI",
            tags=[],
            properties={"vendor": "Oracle", "category": "ERP"},
        )
        db = _DeleteDb(rel, source)
        ctx = SimpleNamespace(workspace=SimpleNamespace(id=rel.workspace_id), org_id=rel.org_id, user_id=uuid4())

        async def allow(_db, _permission):
            return None

        ctx.require_permission = allow
        await delete_relationship(rel.id, ctx, db)
        self.assertEqual(db.deleted, [rel])
        self.assertNotIn("vendor", source.properties)
        self.assertEqual(source.properties["category"], "ERP")


if __name__ == "__main__":
    unittest.main()
