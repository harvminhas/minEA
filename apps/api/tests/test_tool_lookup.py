import asyncio
import json

import pytest

from app.services import tool_lookup as tl


@pytest.fixture(autouse=True)
def _reset():
    tl.reset()
    yield
    tl.reset()


def run(coro):
    return asyncio.run(coro)


def fake(reply, calls):
    async def ai(names):
        calls.append(list(names))
        return json.dumps(reply)
    return ai


def test_suggests_real_product_without_cost_and_caches():
    calls = []
    reply = {"results": [{"input": "Esri Field Maps", "status": "suggested", "name": "ArcGIS Field Maps", "vendor": "Esri",
                          "category": "GIS", "hosting": "saas", "kind": "app", "confidence": 0.92, "typicalAnnual": 999}]}
    out = run(tl.lookup(["Esri Field Maps"], "org1", ai=fake(reply, calls)))
    assert out == [{"input": "Esri Field Maps", "status": "suggested", "name": "ArcGIS Field Maps", "vendor": "Esri",
                    "category": "GIS", "hosting": "saas", "kind": "app", "confidence": 0.92}]
    run(tl.lookup(["esri field maps"], "org1", ai=fake(reply, calls)))
    assert len(calls) == 1  # second call served from the cache


def test_generic_and_gibberish_never_reach_the_model():
    calls = []
    out = run(tl.lookup(["test", "website", "asdfghjk", "zzzz", "12345"], "org1", ai=fake({"results": []}, calls)))
    assert calls == []
    assert [row["status"] for row in out] == ["unknown"] * 5


def test_strict_validation_low_confidence_and_bad_fields_are_unknown():
    reply = {"results": [
        {"input": "Foo Cloud", "status": "suggested", "name": "Foo", "vendor": "Foo", "category": "CRM", "hosting": "saas", "kind": "app", "confidence": 0.3},
        {"input": "Bar Suite", "status": "suggested", "name": "Bar", "vendor": "Bar", "category": "CRM", "hosting": "moon", "kind": "app", "confidence": 0.9},
        {"input": "Baz Desk", "status": "unknown"},
    ]}
    out = run(tl.lookup(["Foo Cloud", "Bar Suite", "Baz Desk"], "org1", ai=fake(reply, [])))
    assert [row["status"] for row in out] == ["unknown", "unknown", "unknown"]


def test_timeout_and_errors_are_unknown_and_not_cached():
    async def slow(names):
        await asyncio.sleep(1)
        return "{}"
    out = run(tl.lookup(["Gizmo Planner"], "org1", ai=slow, timeout=0.05))
    assert out[0]["status"] == "unknown"
    assert tl.CACHE.get("gizmo planner") == (False, None)

    async def boom(names):
        raise RuntimeError("quota")
    assert run(tl.lookup(["Gizmo Planner"], "org1", ai=boom))[0]["status"] == "unknown"


def test_not_configured_is_unknown():
    calls = []
    out = run(tl.lookup(["Gizmo Planner"], "org1", ai=fake({}, calls), configured=False))
    assert calls == [] and out[0]["status"] == "unknown"


def test_rate_limit_per_org():
    for i in range(tl.RATE_PER_MINUTE):
        assert not tl.rate_limited("org1", now=100.0 + i)
    assert tl.rate_limited("org1", now=130.0)
    assert not tl.rate_limited("org2", now=130.0)
    assert not tl.rate_limited("org1", now=200.0)


def test_batch_is_capped_and_deduped():
    calls = []
    names = [f"Product Alpha {i}" for i in range(40)] + ["product alpha 1"]
    out = run(tl.lookup(names, "org1", ai=fake({"results": []}, calls)))
    assert len(out) == tl.MAX_NAMES and len(calls[0]) == tl.MAX_NAMES


def test_route_is_registered():
    from app.main import app
    assert any(getattr(route, "path", "") == "/api/v1/orgs/{org_slug}/catalog/lookup" for route in app.routes)
