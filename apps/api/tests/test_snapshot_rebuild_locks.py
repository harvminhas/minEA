"""Regression: deleting apps one after another hit Vercel FUNCTION_INVOCATION_TIMEOUT.

The debounced snapshot rebuild runs after the response. On Vercel the function can be frozen
mid-task; the old rebuild did an ORM UPDATE and a separate COMMIT, so a freeze between the two
left the workspace_snapshots row locked by an idle transaction and every later write in the
workspace (DELETE /objects/{id} -> notify_workspace_data_changed) waited on it until timeout.
Rebuild writes are now single autocommit statements, and request-side marks wait at most a
bounded lock_timeout."""
import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.services import workspace_snapshot_store as store

W = uuid.uuid4()
O = uuid.uuid4()


class _Conn:
    def __init__(self, log):
        self.log = log
        self.isolation = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execution_options(self, **kw):
        self.isolation = kw.get("isolation_level")
        return self

    async def execute(self, statement, params=None):
        self.log.append((self.isolation, " ".join(str(statement).split()), params))


class _Engine:
    def __init__(self):
        self.log = []

    def connect(self):
        return _Conn(self.log)


class _ReadSession:
    def __init__(self, log):
        self.log = log

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, statement, params=None):
        self.log.append(("read", " ".join(str(statement).split()), params))

    async def rollback(self):
        self.log.append(("read", "ROLLBACK", None))

    async def commit(self):  # the read session must never write
        raise AssertionError("summary session committed a write")

    def add(self, _row):
        raise AssertionError("summary session added a row")


def _patch(monkeypatch, summary):
    engine = _Engine()
    monkeypatch.setattr(store, "engine", engine)
    monkeypatch.setattr(store, "AsyncSessionLocal", lambda: _ReadSession(engine.log))
    monkeypatch.setattr(store, "fetch_workspace_summary", summary)
    return engine


def test_rebuild_writes_are_single_autocommit_statements(monkeypatch):
    async def summary(_db, _w, _o):
        return SimpleNamespace(model_dump=lambda mode: {"system_count": 3})

    engine = _patch(monkeypatch, summary)
    asyncio.run(store.rebuild_snapshot_now(W, O))
    writes = [entry for entry in engine.log if entry[0] != "read"]
    assert [w[0] for w in writes] == ["AUTOCOMMIT", "AUTOCOMMIT"]
    assert writes[0][1].startswith("INSERT INTO workspace_snapshots") and "ON CONFLICT (workspace_id)" in writes[0][1]
    assert writes[1][1].startswith("UPDATE workspace_snapshots SET payload") and "dirty = FALSE" in writes[1][1]
    assert writes[1][2]["payload"] == '{"system_count": 3}'
    reads = [entry[1] for entry in engine.log if entry[0] == "read"]
    assert "idle_in_transaction_session_timeout" in reads[0] and reads[-1] == "ROLLBACK"


def test_failed_rebuild_marks_dirty_in_autocommit(monkeypatch):
    async def summary(_db, _w, _o):
        raise RuntimeError("boom")

    engine = _patch(monkeypatch, summary)
    with pytest.raises(RuntimeError):
        asyncio.run(store.rebuild_snapshot_now(W, O))
    writes = [entry for entry in engine.log if entry[0] != "read"]
    assert [w[0] for w in writes] == ["AUTOCOMMIT", "AUTOCOMMIT"]
    assert "rebuilding = FALSE, dirty = TRUE" in writes[-1][1]


def test_request_side_mark_waits_a_bounded_time_for_locks(monkeypatch):
    calls = []

    class _Db:
        async def execute(self, statement, params=None):
            calls.append((" ".join(str(statement).split()), params))

    async def row(_db, _w, _o):
        return SimpleNamespace(dirty=False, dirty_at=None, org_id=None)

    monkeypatch.setattr(store, "_get_or_create_row", row)
    asyncio.run(store.mark_snapshot_dirty(_Db(), W, O))
    assert "lock_timeout" in calls[0][0] and calls[0][1] == {"t": store.WRITE_LOCK_TIMEOUT}
