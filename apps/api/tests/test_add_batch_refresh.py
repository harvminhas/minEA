"""Regression: setup step 'Which of these have AI turned on?' sends one /objects/batch with an
overwrite update per app. Reading the second app's updated_at after the first read's query had
autoflushed it raised MissingGreenlet -> HTTP 500. Updated rows are now flushed, then reloaded in one
SELECT (populate_existing) before any read."""
import asyncio
import uuid
from types import SimpleNamespace

from app.services import add_batch as mod
from app.services.add_batch import AddBatchRequest, apply_add_batch

FEATURE = {"key": "copilot", "name": "Copilot", "status": "on", "sees_company_data": "unknown",
           "vendor_trains": "unknown", "source": "onboarding", "audience": "everyone"}


class _Row(SimpleNamespace):
    """A setattr after load marks the row dirty, like an ORM instance."""

    def __setattr__(self, key, value):
        super().__setattr__(key, value)
        if key not in ("dirty", "expired"):
            super().__setattr__("dirty", True)


class _Db:
    """Mimics the async session: a flush expires updated_at on dirty rows; only refresh reloads it."""

    def __init__(self, objs):
        self.objs = {o.id: o for o in objs}
        self.events = []

    async def execute(self, stmt):
        if stmt.get_execution_options().get("populate_existing"):
            self.events.append("reload")
            for o in self.objs.values():
                o.__dict__["expired"] = False
            return SimpleNamespace()
        rows = list(self.objs.values())
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

    def add(self, row):
        pass

    async def flush(self):
        self.events.append("flush")
        for o in self.objs.values():
            if o.__dict__.get("dirty"):
                o.__dict__.update(dirty=False, expired=True)

    async def refresh(self, obj):
        self.events.append(("refresh", obj.id))
        obj.expired = False


def test_ai_step_batch_of_several_apps_reads_fresh_rows():
    apps = [_Row(id=uuid.uuid4(), name=n, type="application", properties={}, updated_by=None,
                            owner="x", owner_team_name="x", point_of_contact_name="x", expired=False)
            for n in ("Slack", "Microsoft 365", "Zoom")]
    for a in apps:
        a.__dict__["dirty"] = False
    db = _Db(apps)
    body = AddBatchRequest(updates=[{"id": a.id, "properties": {"ai_features": [FEATURE]}, "overwrite": True} for a in apps])

    async def to_read(_db, obj):
        assert not obj.expired, f"{obj.name} read with an expired updated_at (MissingGreenlet in prod)"
        await _db.flush()  # like enrich_single_system's query autoflushing the session
        return obj

    async def go():
        orig = mod.AddBatchResult
        mod.AddBatchResult = lambda **kw: SimpleNamespace(**kw)
        try:
            return await apply_add_batch(db, workspace_id=uuid.uuid4(), org_id=uuid.uuid4(), user_id=None, body=body, to_read=to_read)
        finally:
            mod.AddBatchResult = orig

    from app.services import add_batch as svc
    orig_validate = svc.validate_object_write

    async def no_validate(*a, **k):
        return None

    svc.validate_object_write = no_validate
    try:
        result = asyncio.run(go())
    finally:
        svc.validate_object_write = orig_validate
    assert [o.name for o in result.objects] == ["Slack", "Microsoft 365", "Zoom"]
    assert all(o.properties["ai_features"][0]["status"] == "on" for o in apps)
    assert db.events[:2] == ["flush", "reload"]
