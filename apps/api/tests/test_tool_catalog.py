import asyncio

import pytest

from app.services import tool_catalog as tc


def test_bundled_catalogue_matches_web_and_has_unique_names():
    tools = tc.bundled_tools()
    assert len(tools) >= 500
    keys = [tc.normalize(t["name"]) for t in tools]
    assert len(keys) == len(set(keys))
    assert {t["name"] for t in tools} >= {"Salesforce", "Dayforce", "ArcGIS Online", "Collibra", "Procore"}


def test_platform_admin_needs_listed_and_verified_email(monkeypatch):
    monkeypatch.setenv("PLATFORM_ADMIN_EMAILS", "Harv@Example.com, ops@example.com")
    assert tc.is_platform_admin("harv@example.com", True)
    assert not tc.is_platform_admin("harv@example.com", False)
    assert not tc.is_platform_admin("someone@example.com", True)
    monkeypatch.delenv("PLATFORM_ADMIN_EMAILS")
    assert not tc.is_platform_admin("harv@example.com", True)


def test_validate_entry_cleans_and_rejects():
    entry = tc.validate_entry({"name": " Tekla Structures ", "aliases": "tekla, Tekla Structures, TEKLA", "vendor": "Trimble",
                               "category": "Construction", "hosting": "desktop", "kind": "app", "typicalAnnual": "", "ssoUsual": 0})
    assert entry == {"name": "Tekla Structures", "aliases": ["tekla"], "vendor": "Trimble", "category": "Construction",
                     "hosting": "desktop", "kind": "app", "typicalAnnual": None, "ssoUsual": False, "typicalPerSeatMonthly": None}
    for bad in ({"name": ""}, {"name": "X", "hosting": "moon"}, {"name": "X", "kind": "thing"}, {"name": "X", "typicalAnnual": "lots"}):
        with pytest.raises(ValueError):
            tc.validate_entry(bad)


def test_collisions_name_alias_but_edi_shared():
    tools = [{"name": "Salesforce", "aliases": ["sfdc"]}, {"name": "Cleo", "aliases": ["edi"]}]
    assert tc.collisions({"name": "X", "aliases": ["sfdc", "edi"]}, tools) == ["sfdc (Salesforce)"]
    assert tc.collisions({"name": "Salesforce", "aliases": ["sfdc"]}, tools, skip_name_key="salesforce") == []


def test_etag_changes_with_content():
    a = [{"name": "A", "aliases": []}]
    assert tc.etag_for(a) == tc.etag_for([{"aliases": [], "name": "A"}])
    assert tc.etag_for(a) != tc.etag_for([{"name": "B", "aliases": []}])


class _BrokenDb:
    async def execute(self, *a, **k):
        raise RuntimeError('relation "tool_catalog_entries" does not exist')

    async def rollback(self):
        pass

    async def commit(self):
        pass


def test_falls_back_to_bundled_when_table_missing():
    tc.invalidate()
    tools, etag, source = asyncio.run(tc.load_tools(_BrokenDb()))
    assert source == "bundled" and len(tools) >= 500 and etag.startswith('W/"')


def test_record_misses_never_raises():
    asyncio.run(tc.record_misses(_BrokenDb(), [{"input": "Tekla Structures", "status": "unknown"}]))


def test_routes_registered_and_admin_guarded():
    from app.main import app
    paths = {getattr(r, "path", "") for r in app.routes}
    for path in ("/api/v1/catalog/tools", "/api/v1/platform/me", "/api/v1/platform/catalog/entries",
                 "/api/v1/platform/catalog/entries/{entry_id}", "/api/v1/platform/catalog/misses"):
        assert path in paths, path
    from app.routers import platform_catalog as pc
    import inspect
    for fn in (pc.list_entries, pc.create_entry, pc.update_entry, pc.delete_entry, pc.list_misses, pc.dismiss_miss):
        assert "require_platform_admin" in inspect.getsource(fn), fn.__name__


def test_require_platform_admin_rejects_unlisted(monkeypatch):
    from fastapi import HTTPException

    from app.auth import AuthContext
    from app.routers.platform_catalog import require_platform_admin
    monkeypatch.setenv("PLATFORM_ADMIN_EMAILS", "harv@example.com")
    with pytest.raises(HTTPException) as err:
        asyncio.run(require_platform_admin(AuthContext("uid", "x@example.com"), _BrokenDb()))
    assert err.value.status_code == 403


def test_per_seat_price_optional_and_validated():
    assert tc.validate_entry({"name": "X", "typicalPerSeatMonthly": "12.5"})["typicalPerSeatMonthly"] == 12.5
    for bad in ("abc", -1):
        with pytest.raises(ValueError):
            tc.validate_entry({"name": "X", "typicalPerSeatMonthly": bad})
    assert all("typicalPerSeatMonthly" not in t for t in tc.bundled_tools()), "no invented per-seat prices"
