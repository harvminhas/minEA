import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.services import catalog_cache


def test_dirty_catalog_is_rebuilt_before_it_is_read():
    workspace_id = uuid4()
    org_id = uuid4()
    stored = {"version": 1, "objects": [{"name": "old"}], "dirty": False}
    sentinel = {"version": 2, "objects": [{"name": "Microsoft 365"}]}

    async def run():
        dirty = {"catalog_dirty": True, "catalog_building": False, "catalog_version": 1, "catalog_built_at": None}
        with (
            patch.object(catalog_cache, "_state", new=AsyncMock(return_value=dirty)),
            patch.object(catalog_cache, "_read_stored", new=AsyncMock(return_value=dict(stored))),
            patch.object(catalog_cache, "refresh_catalog", new=AsyncMock(return_value=sentinel)) as refresh,
        ):
            result = await catalog_cache.get_catalog(None, workspace_id, org_id)
        assert result is sentinel
        refresh.assert_awaited_once()

        clean = {"catalog_dirty": False, "catalog_building": False, "catalog_version": 1, "catalog_built_at": None}
        with (
            patch.object(catalog_cache, "_state", new=AsyncMock(return_value=clean)),
            patch.object(catalog_cache, "_read_stored", new=AsyncMock(return_value=dict(stored))),
            patch.object(catalog_cache, "refresh_catalog", new=AsyncMock(return_value=sentinel)) as refresh,
        ):
            result = await catalog_cache.get_catalog(None, workspace_id, org_id)
        assert result["objects"] == stored["objects"]
        assert result["dirty"] is False
        refresh.assert_not_awaited()

    asyncio.run(run())
