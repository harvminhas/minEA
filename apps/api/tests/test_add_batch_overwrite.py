import asyncio
import uuid
from types import SimpleNamespace

from app.services.add_batch import AddBatchRequest, AddBatchUpdate, apply_add_batch


class _Result:
    def __init__(self, obj):
        self.obj = obj

    def scalar_one_or_none(self):
        return self.obj


class _Db:
    def __init__(self, obj):
        self.obj = obj
        self.added = []

    async def execute(self, _stmt):
        return _Result(self.obj)

    def add(self, row):
        self.added.append(row)


def _run(obj, update):
    db = _Db(obj)
    body = AddBatchRequest(updates=[update])

    async def to_read(_db, o):
        return o

    async def go():
        from app.services import add_batch as mod

        orig = mod.AddBatchResult
        mod.AddBatchResult = lambda **kw: SimpleNamespace(**kw)
        try:
            return await apply_add_batch(db, workspace_id=uuid.uuid4(), org_id=uuid.uuid4(), user_id=None, body=body, to_read=to_read)
        finally:
            mod.AddBatchResult = orig

    return asyncio.run(go()), db


def _app(props):
    return SimpleNamespace(id=uuid.uuid4(), type="application", properties=props, owner="x", owner_team_name="x", point_of_contact_name="x")


def test_default_update_only_fills_blanks():
    obj = _app({"hosting_model": "saas"})
    _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "desktop"}))
    assert obj.properties["hosting_model"] == "saas"


def test_overwrite_sets_like_put_and_logs_change():
    obj = _app({"hosting_model": "saas", "vendor": "Intuit"})
    result, db = _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "on_premise"}, overwrite=True))
    assert obj.properties == {"hosting_model": "on_premise", "vendor": "Intuit"}
    assert result.objects == [obj]
    assert len(db.added) == 1


def test_overwrite_unchanged_is_a_no_op():
    obj = _app({"hosting_model": "saas"})
    result, db = _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "saas"}, overwrite=True))
    assert result.objects == [] and db.added == []
