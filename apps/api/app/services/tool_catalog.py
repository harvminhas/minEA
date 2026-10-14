"""The app catalogue (tools) served from Postgres, editable by platform admins.

Seeded from app/data/tools.json when the table is empty. If the table is missing (migration 049
not applied) or the DB errors, readers get the bundled JSON, so prefill never breaks.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

BUNDLED = Path(__file__).resolve().parents[1] / "data" / "tools.json"
HOSTINGS = {"saas", "paas", "own", "either", "desktop"}
KINDS = {"app", "platform", "server"}
CACHE_TTL_S = 60.0
_cache: dict[str, Any] = {"at": 0.0, "tools": None, "etag": None}


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def platform_admin_emails() -> set[str]:
    raw = os.getenv("PLATFORM_ADMIN_EMAILS", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def is_platform_admin(email: str | None, verified: bool) -> bool:
    return bool(email) and verified and email.strip().lower() in platform_admin_emails()


def bundled_tools() -> list[dict[str, Any]]:
    return json.loads(BUNDLED.read_text())


def etag_for(tools: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256(json.dumps(tools, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return f'W/"{digest[:20]}"'


def validate_entry(body: dict[str, Any]) -> dict[str, Any]:
    """Clean an admin's entry. Raises ValueError with a person-readable message."""
    name = str(body.get("name") or "").strip()
    if not name:
        raise ValueError("Name is required")
    aliases = body.get("aliases") or []
    if isinstance(aliases, str):
        aliases = aliases.split(",")
    clean_aliases: list[str] = []
    for alias in aliases:
        alias = str(alias).strip().lower()
        if alias and normalize(alias) != normalize(name) and alias not in clean_aliases:
            clean_aliases.append(alias)
    hosting = body.get("hosting") or "either"
    kind = body.get("kind") or "app"
    if hosting not in HOSTINGS:
        raise ValueError(f"Hosting must be one of {', '.join(sorted(HOSTINGS))}")
    if kind not in KINDS:
        raise ValueError(f"Kind must be one of {', '.join(sorted(KINDS))}")
    typical = body.get("typicalAnnual")
    if typical in ("", None):
        typical = None
    else:
        try:
            typical = int(typical)
        except (TypeError, ValueError):
            raise ValueError("Typical annual cost must be a whole number or empty") from None
        if typical < 0:
            raise ValueError("Typical annual cost can't be negative")
    return {
        "name": name[:200],
        "aliases": clean_aliases[:40],
        "vendor": str(body.get("vendor") or "").strip()[:200],
        "category": str(body.get("category") or "").strip()[:100],
        "hosting": hosting,
        "kind": kind,
        "typicalAnnual": typical,
        "ssoUsual": bool(body.get("ssoUsual")),
    }


def row_to_tool(row: Any) -> dict[str, Any]:
    m = row._mapping if hasattr(row, "_mapping") else row
    extra = m["extra"] or {}
    tool: dict[str, Any] = {
        "name": m["name"], "aliases": list(m["aliases"] or []), "vendor": m["vendor"], "category": m["category"],
        "hosting": m["hosting"], "kind": m["kind"], "typicalAnnual": m["typical_annual"], "unit": extra.get("unit", "year"),
    }
    for key in ("hints", "idp"):
        if key in extra:
            tool[key] = extra[key]
    if m["sso_usual"]:
        tool["ssoUsual"] = True
    return tool


def collisions(entry: dict[str, Any], tools: list[dict[str, Any]], skip_name_key: str | None = None) -> list[str]:
    """Names/aliases of this entry already used by another tool ('edi' is shared on purpose)."""
    mine = {normalize(entry["name"]), *map(normalize, entry["aliases"])} - {"edi"}
    out = []
    for tool in tools:
        if normalize(tool["name"]) == skip_name_key:
            continue
        theirs = {normalize(tool["name"]), *map(normalize, tool["aliases"])}
        out += [f"{name} ({tool['name']})" for name in sorted(mine & theirs)]
    return out


def invalidate() -> None:
    _cache.update(at=0.0, tools=None, etag=None)


async def seed_if_empty(db: AsyncSession) -> int:
    count = (await db.execute(text("SELECT count(*) FROM tool_catalog_entries"))).scalar_one()
    if count:
        return 0
    tools = bundled_tools()
    for tool in tools:
        await db.execute(
            text(
                "INSERT INTO tool_catalog_entries (name, name_key, aliases, vendor, category, hosting, kind, typical_annual, sso_usual, extra, updated_by)"
                " VALUES (:name, :key, CAST(:aliases AS JSONB), :vendor, :category, :hosting, :kind, :typical, :sso, CAST(:extra AS JSONB), 'seed')"
                " ON CONFLICT (name_key) DO NOTHING"
            ),
            {
                "name": tool["name"], "key": normalize(tool["name"]), "aliases": json.dumps(tool["aliases"]),
                "vendor": tool["vendor"], "category": tool["category"], "hosting": tool["hosting"], "kind": tool["kind"],
                "typical": tool.get("typicalAnnual"), "sso": bool(tool.get("ssoUsual")),
                "extra": json.dumps({k: tool[k] for k in ("unit", "hints", "idp") if k in tool}),
            },
        )
    await db.commit()
    invalidate()
    return len(tools)


async def load_tools(db: AsyncSession) -> tuple[list[dict[str, Any]], str, str]:
    """(tools, etag, source) with source 'db' or 'bundled'. Cached for a minute per process."""
    if _cache["tools"] is not None and time.monotonic() - _cache["at"] < CACHE_TTL_S:
        return _cache["tools"], _cache["etag"], "db"
    try:
        await seed_if_empty(db)
        rows = (await db.execute(text("SELECT * FROM tool_catalog_entries ORDER BY created_at, name"))).all()
        tools = [row_to_tool(row) for row in rows]
    except Exception:  # table missing (049 not applied) or DB down
        logger.warning("tool catalogue: falling back to bundled tools.json", exc_info=True)
        await db.rollback()
        tools = bundled_tools()
        return tools, etag_for(tools), "bundled"
    etag = etag_for(tools)
    _cache.update(at=time.monotonic(), tools=tools, etag=etag)
    return tools, etag, "db"


async def record_misses(db: AsyncSession, results: list[dict[str, Any]]) -> None:
    """Count typed names the catalogue missed (best effort; never fails the lookup)."""
    try:
        for row in results:
            from app.services.tool_lookup import looks_unknowable

            key = normalize(row["input"])
            if looks_unknowable(row["input"]):
                continue
            suggestion = {k: row[k] for k in ("name", "vendor", "category", "hosting", "kind", "confidence") if k in row} or None
            await db.execute(
                text(
                    "INSERT INTO tool_catalog_misses (name_key, sample, suggestion) VALUES (:key, :sample, CAST(:s AS JSONB))"
                    " ON CONFLICT (name_key) DO UPDATE SET count = tool_catalog_misses.count + 1, last_seen = now(),"
                    " suggestion = COALESCE(EXCLUDED.suggestion, tool_catalog_misses.suggestion)"
                ),
                {"key": key, "sample": row["input"][:120], "s": json.dumps(suggestion) if suggestion else None},
            )
        await db.commit()
    except Exception:
        logger.warning("tool catalogue: could not record misses", exc_info=True)
        await db.rollback()
