"""Per-workspace UI settings stored in workspaces.settings (migration 048).

The column is read and written with plain SQL rather than mapped on the Workspace model, so a
deploy that lands before the migration runs keeps working: reads report stored=False and the
web app falls back to its defaults.
"""
from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

ALLOWED_KEYS = {"architectureAdvanced"}


def clean_settings(raw: object) -> dict:
    """Only known keys with the right types survive."""
    data = raw if isinstance(raw, dict) else {}
    out: dict = {}
    value = data.get("architectureAdvanced")
    if isinstance(value, bool):
        out["architectureAdvanced"] = value
    return out


def merge_settings(current: object, patch: dict) -> dict:
    merged = clean_settings(current)
    for key, value in patch.items():
        if key not in ALLOWED_KEYS:
            continue
        if value is None:
            merged.pop(key, None)
        else:
            merged[key] = value
    return clean_settings(merged)


async def read_workspace_settings(db: AsyncSession, workspace_id: UUID) -> tuple[dict, bool]:
    """(settings, stored). stored is False when the column doesn't exist yet."""
    try:
        async with db.begin_nested():
            row = (await db.execute(text("SELECT settings FROM workspaces WHERE id = :id"), {"id": workspace_id})).first()
    except DBAPIError:
        return {}, False
    raw = row[0] if row else {}
    if isinstance(raw, str):
        raw = json.loads(raw or "{}")
    return clean_settings(raw), True


async def write_workspace_settings(db: AsyncSession, workspace_id: UUID, patch: dict) -> tuple[dict, bool]:
    current, stored = await read_workspace_settings(db, workspace_id)
    if not stored:
        return current, False
    merged = merge_settings(current, patch)
    async with db.begin_nested():
        await db.execute(
            text("UPDATE workspaces SET settings = CAST(:settings AS JSONB) WHERE id = :id"),
            {"settings": json.dumps(merged), "id": workspace_id},
        )
    return merged, True
