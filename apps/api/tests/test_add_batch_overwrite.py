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
    return SimpleNamespace(id=uuid.uuid4(), name="App", type="application", properties=props, updated_by=None, owner="x", owner_team_name="x", point_of_contact_name="x")


def test_default_update_only_fills_blanks():
    obj = _app({"hosting_model": "saas"})
    _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "desktop"}))
    assert obj.properties["hosting_model"] == "saas"


def test_overwrite_sets_like_put_and_logs_change():
    obj = _app({"hosting_model": "saas", "vendor": "Intuit"})
    result, db = _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "on_premise"}, overwrite=True))
    assert obj.properties["hosting_model"] == "on_premise" and obj.properties["vendor"] == "Intuit"
    assert result.objects == [obj]
    assert len(db.added) == 1


def test_overwrite_unchanged_writes_no_change_log():
    obj = _app({"hosting_model": "saas"})
    _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "saas"}, overwrite=True))
    result, db = _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "saas"}, overwrite=True))
    assert db.added == []


def test_overwrite_normalizes_exactly_like_put():
    from app.schemas.objects import ObjectUpdate
    from app.services.capability_validation import _validate_system

    obj = _app({"vendor": "Intuit"})
    body = ObjectUpdate(properties={"hosting_model": "saas"})
    _validate_system(body, existing_properties=dict(obj.properties))
    _run(obj, AddBatchUpdate(id=obj.id, properties={"hosting_model": "saas"}, overwrite=True))
    for key, value in (body.properties or {}).items():
        assert obj.properties.get(key) == value


def test_overwrite_with_nothing_to_send_is_skipped():
    obj = _app({"hosting_model": "saas"})
    result, db = _run(obj, AddBatchUpdate(id=obj.id, overwrite=True))
    assert result.objects == [] and db.added == []


def test_overwrite_sets_owner_fields_like_put(monkeypatch):
    from app.services import add_batch as mod

    seen = []

    async def fake_owner(_db, entity, **kw):
        seen.append(kw)

    monkeypatch.setattr(mod, "apply_ownership_write_resolved", fake_owner)
    obj = _app({})
    _run(obj, AddBatchUpdate(id=obj.id, owner="Finance", owner_team_name="Finance", point_of_contact_name="Priya", properties={"contract_renewal": "2027-01-31"}, overwrite=True))
    assert seen[0]["owner_team_name"] == "Finance" and seen[0]["point_of_contact_name"] == "Priya"
    assert obj.properties["contract_renewal"] == "2027-01-31"


def test_overwrite_ai_features_strict_like_put():
    obj = _app({"ai_features": [{"key": "old", "name": "Old", "status": "on"}]})
    _run(obj, AddBatchUpdate(id=obj.id, properties={"ai_features": []}, overwrite=True))
    assert obj.properties.get("ai_features") in ([], None)
