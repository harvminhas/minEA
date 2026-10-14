"""Clouds & tenants: fixed providers, built-in regions, workspace custom regions, region refs.

- Providers and standard regions come from app/data/cloud_regions.json (the web has a copy;
  parity tests on both sides).
- A region is referenced by key: "<provider>:<code>" for a built-in region (e.g.
  "azure:canadacentral") or "custom:<uuid>" for a cloud_regions row (migration 051). Regions belong
  to the provider and are shared by every tenant of that provider.
- App -> tenant links (runs_on / built_on to a cloud_service) carry attributes.region_key. Links from
  before 051 carry free-text attributes.region; 051 adds the key and keeps the text, and readers
  fall back to resolving the text.
- Custom regions live per workspace (like People & teams); raw SQL so every other screen keeps
  working before 051 is applied.
"""
from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CATALOG: dict[str, Any] = json.loads((Path(__file__).resolve().parent.parent / "data" / "cloud_regions.json").read_text(encoding="utf-8"))
PROVIDER_IDS: tuple[str, ...] = tuple(p["id"] for p in CATALOG["providers"])
STANDARD: dict[str, dict[str, Any]] = {r["key"]: {**r, "provider": pid} for pid, rows in CATALOG["regions"].items() for r in rows}
KEY_RE = re.compile(r"^(custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9_]+:[a-z0-9-]+)$")
CUSTOM_RE = re.compile(r"^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
NAME_MAX = 120
LINK_TYPES = ("runs_on", "built_on")


def clean_name(value: Any) -> str:
    return " ".join(str(value or "").split())[:NAME_MAX]


def valid_region_key(key: Any) -> bool:
    if not isinstance(key, str) or not KEY_RE.match(key):
        return False
    return key in STANDARD or bool(CUSTOM_RE.match(key))


def standard_match(provider: str, name: str) -> str | None:
    """Built-in key for a name or alias of that provider's regions, case/space-insensitive."""
    wanted = clean_name(name).lower()
    if not wanted:
        return None
    for row in CATALOG["regions"].get(provider, []):
        if wanted in {clean_name(a).lower() for a in (row["name"], *row["aliases"])}:
            return row["key"]
    return None


def tenant_provider(properties: dict[str, Any] | None, name: str = "") -> str:
    """The fixed provider of a tenant/account platform (same rules as migration 051 and the web)."""
    props = properties or {}
    explicit = props.get("cloud_provider")
    if explicit in PROVIDER_IDS:
        return str(explicit)
    n = (name or "").lower()
    if "azure" in n:
        return "azure"
    if re.search(r"\baws\b|amazon web services", n):
        return "aws"
    if re.search(r"google cloud|\bgcp\b", n):
        return "gcp"
    if re.search(r"microsoft 365|office 365|\bm365\b|\bo365\b", n):
        return "m365"
    if re.search(r"google workspace|g suite", n):
        return "google_workspace"
    if "salesforce" in n:
        return "salesforce"
    vendor = str(props.get("vendor") or "").lower()
    cloud = props.get("platform_kind") == "cloud_account"
    if vendor == "microsoft":
        return "azure" if cloud else "m365"
    if vendor in ("amazon", "aws"):
        return "aws"
    if vendor == "google":
        return "gcp" if cloud else "google_workspace"
    if vendor == "salesforce":
        return "salesforce"
    return "other"


def provider_of(provider: Any) -> str:
    if provider not in PROVIDER_IDS:
        raise ValueError("Pick a provider from the list.")
    return str(provider)


async def table_available(db: AsyncSession) -> bool:
    return bool((await db.execute(text("SELECT to_regclass('public.cloud_regions') IS NOT NULL"))).scalar_one())


def _usage_sql() -> str:
    return ("(SELECT count(*) FROM relationships r WHERE r.workspace_id = x.workspace_id AND r.type IN ('runs_on','built_on')"
            " AND r.attributes->>'region_key' = 'custom:' || x.id::text)")


async def list_custom(db: AsyncSession, workspace_id: uuid.UUID) -> list[dict[str, Any]]:
    if not await table_available(db):
        return []
    rows = (await db.execute(text(
        f"SELECT x.id, x.provider, x.name, ({_usage_sql()}) AS usage FROM cloud_regions x WHERE x.workspace_id = :ws ORDER BY x.provider, lower(x.name)"
    ), {"ws": workspace_id})).mappings().all()
    return [{"id": str(r["id"]), "key": f"custom:{r['id']}", "provider": r["provider"], "name": r["name"], "usage": int(r["usage"] or 0)} for r in rows]


async def _custom_by_name(db: AsyncSession, workspace_id: uuid.UUID, provider: str, name: str) -> str | None:
    found = (await db.execute(text(
        "SELECT id FROM cloud_regions WHERE workspace_id = :ws AND provider = :p AND lower(name) = lower(:n) LIMIT 1"
    ), {"ws": workspace_id, "p": provider, "n": name})).scalar_one_or_none()
    return str(found) if found else None


async def create_custom(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID | None, provider: Any, name: Any) -> dict[str, Any]:
    """{key, name, created}. A built-in name or alias returns the built-in region; an existing
    custom name is reused. Only otherwise is a new custom region stored."""
    provider = provider_of(provider)
    clean = clean_name(name)
    if not clean:
        raise ValueError("Region name is required")
    std = standard_match(provider, clean)
    if std:
        return {"key": std, "name": STANDARD[std]["name"], "created": False}
    if not await table_available(db):
        raise RuntimeError("Custom regions need migration 051_cloud_regions.sql")
    existing = await _custom_by_name(db, workspace_id, provider, clean)
    if existing:
        return {"key": f"custom:{existing}", "name": clean, "created": False}
    new_id = (await db.execute(text(
        "INSERT INTO cloud_regions (workspace_id, org_id, provider, name, created_by) VALUES (:ws, :org, :p, :n, :by) RETURNING id"
    ), {"ws": workspace_id, "org": org_id, "p": provider, "n": clean, "by": user_id})).scalar_one()
    await db.commit()
    return {"key": f"custom:{new_id}", "name": clean, "created": True}


async def _custom_row(db: AsyncSession, workspace_id: uuid.UUID, region_id: str):
    return (await db.execute(text("SELECT * FROM cloud_regions WHERE id = CAST(:id AS UUID) AND workspace_id = :ws"),
                             {"id": region_id, "ws": workspace_id})).mappings().first()


async def rename_custom(db: AsyncSession, workspace_id: uuid.UUID, region_id: str, name: Any) -> None:
    row = await _custom_row(db, workspace_id, region_id)
    if not row:
        raise LookupError("Not found")
    clean = clean_name(name)
    if not clean:
        raise ValueError("Region name is required")
    if standard_match(row["provider"], clean):
        raise ValueError(f"“{clean}” is a built-in region. Merge into it instead.")
    clash = await _custom_by_name(db, workspace_id, row["provider"], clean)
    if clash and clash != str(row["id"]):
        raise ValueError(f"“{clean}” already exists. Merge them instead.")
    await db.execute(text("UPDATE cloud_regions SET name = :n, updated_at = now() WHERE id = CAST(:id AS UUID)"), {"n": clean, "id": region_id})
    await _dirty(db, workspace_id)
    await db.commit()


async def _replace_key(db: AsyncSession, workspace_id: uuid.UUID, old: str, new: str | None) -> None:
    """Point links and tenants' regions_used from `old` to `new` (None: drop the region)."""
    p = {"ws": workspace_id, "old": old, "new": new}
    if new:
        await db.execute(text(
            "UPDATE relationships SET attributes = (attributes - 'region') || jsonb_build_object('region_key', CAST(:new AS TEXT))"
            " WHERE workspace_id = :ws AND type IN ('runs_on','built_on') AND attributes->>'region_key' = :old"), p)
    else:
        await db.execute(text(
            "UPDATE relationships SET attributes = attributes - 'region_key' - 'region'"
            " WHERE workspace_id = :ws AND type IN ('runs_on','built_on') AND attributes->>'region_key' = :old"), p)
    await db.execute(text(
        "UPDATE objects SET properties = jsonb_set(properties, '{regions_used}', COALESCE((SELECT jsonb_agg(DISTINCT v) FROM ("
        "  SELECT CASE WHEN e = :old THEN CAST(:new AS TEXT) ELSE e END AS v FROM jsonb_array_elements_text(properties->'regions_used') e) s"
        "  WHERE v IS NOT NULL), '[]'::jsonb))"
        " WHERE workspace_id = :ws AND type = 'cloud_service' AND jsonb_typeof(properties->'regions_used') = 'array'"
        " AND properties->'regions_used' ? :old"), p)


async def merge_custom(db: AsyncSession, workspace_id: uuid.UUID, into_key: str, from_ids: list[str]) -> int:
    """Move every use of the custom regions `from_ids` onto `into_key` (custom or built-in, same
    provider), then delete them."""
    if not valid_region_key(into_key):
        raise LookupError("Not found")
    if into_key.startswith("custom:"):
        target = await _custom_row(db, workspace_id, into_key.removeprefix("custom:"))
        if not target:
            raise LookupError("Not found")
        target_provider = target["provider"]
    else:
        target_provider = STANDARD[into_key]["provider"]
    merged = 0
    for source_id in dict.fromkeys(from_ids):
        if f"custom:{source_id}" == into_key:
            continue
        source = await _custom_row(db, workspace_id, source_id)
        if not source:
            raise LookupError("Not found")
        if source["provider"] != target_provider:
            raise ValueError("Regions belong to a provider: merge within one provider.")
        await _replace_key(db, workspace_id, f"custom:{source_id}", into_key)
        await db.execute(text("DELETE FROM cloud_regions WHERE id = CAST(:id AS UUID)"), {"id": source_id})
        merged += 1
    await _dirty(db, workspace_id)
    await db.commit()
    return merged


async def delete_custom(db: AsyncSession, workspace_id: uuid.UUID, region_id: str) -> None:
    """Links that used it keep their tenant and lose the region (shown as Region not recorded)."""
    if not await _custom_row(db, workspace_id, region_id):
        raise LookupError("Not found")
    await _replace_key(db, workspace_id, f"custom:{region_id}", None)
    await db.execute(text("DELETE FROM cloud_regions WHERE id = CAST(:id AS UUID)"), {"id": region_id})
    await _dirty(db, workspace_id)
    await db.commit()


async def _dirty(db: AsyncSession, workspace_id: uuid.UUID) -> None:
    await db.execute(text("UPDATE workspaces SET catalog_dirty = TRUE WHERE id = :id"), {"id": workspace_id})


FILL_PROPS = ("tenant_id", "annual_cost", "vendor", "cloud_provider", "platform_kind", "hosting_model")


def merged_tenant_properties(target: dict[str, Any], sources: list[dict[str, Any]]) -> dict[str, Any]:
    """Target wins; its empty fields are filled from the others; regions_used is the union."""
    out = dict(target or {})
    used: list[str] = list(out.get("regions_used") or [])
    for props in sources:
        for key in FILL_PROPS:
            if out.get(key) in (None, "") and props.get(key) not in (None, ""):
                out[key] = props[key]
        for key in props.get("regions_used") or []:
            if key not in used:
                used.append(key)
    if used:
        out["regions_used"] = used
    return out


async def merge_tenants(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID | None, into_id: str, from_ids: list[str]) -> int:
    """Duplicate tenant records: links move to `into_id` (an app already linked to it keeps that
    link, taking the region from the duplicate if it had none), fields are filled, duplicates go."""
    get = text("SELECT id, name, owner, owner_team_id, properties FROM objects WHERE id = CAST(:id AS UUID) AND workspace_id = :ws AND type = 'cloud_service'")
    target = (await db.execute(get, {"id": into_id, "ws": workspace_id})).mappings().first()
    if not target:
        raise LookupError("Not found")
    sources = []
    for source_id in dict.fromkeys(from_ids):
        if source_id == into_id:
            continue
        row = (await db.execute(get, {"id": source_id, "ws": workspace_id})).mappings().first()
        if not row:
            raise LookupError("Not found")
        sources.append(row)
    p_base = {"ws": workspace_id, "into": into_id}
    for source in sources:
        p = {**p_base, "src": str(source["id"])}
        # Same link already on the target: keep the target's, add the duplicate's region if missing.
        await db.execute(text(
            "UPDATE relationships t SET attributes = s.attributes || t.attributes FROM relationships s"
            " WHERE s.workspace_id = :ws AND t.workspace_id = :ws AND s.to_object_id = CAST(:src AS UUID) AND t.to_object_id = CAST(:into AS UUID)"
            " AND s.type = t.type AND s.from_object_id = t.from_object_id"), p)
        await db.execute(text(
            "DELETE FROM relationships s USING relationships t WHERE s.workspace_id = :ws AND t.workspace_id = :ws"
            " AND s.to_object_id = CAST(:src AS UUID) AND t.to_object_id = CAST(:into AS UUID) AND s.type = t.type AND s.from_object_id = t.from_object_id"), p)
        await db.execute(text(
            "DELETE FROM relationships s USING relationships t WHERE s.workspace_id = :ws AND t.workspace_id = :ws"
            " AND s.from_object_id = CAST(:src AS UUID) AND t.from_object_id = CAST(:into AS UUID) AND s.type = t.type AND s.to_object_id = t.to_object_id"), p)
        await db.execute(text("UPDATE relationships SET to_object_id = CAST(:into AS UUID) WHERE workspace_id = :ws AND to_object_id = CAST(:src AS UUID)"), p)
        await db.execute(text("UPDATE relationships SET from_object_id = CAST(:into AS UUID) WHERE workspace_id = :ws AND from_object_id = CAST(:src AS UUID)"), p)
        await db.execute(text(
            "INSERT INTO change_log (workspace_id, org_id, object_id, object_type, action, diff, performed_by)"
            " VALUES (:ws, :org, CAST(:src AS UUID), 'cloud_service', 'deleted', CAST(:diff AS JSONB), :by)"
        ), {"ws": workspace_id, "org": org_id, "src": str(source["id"]), "by": user_id,
            "diff": json.dumps({"action_type": "merged_object", "name": source["name"], "into": into_id})})
        await db.execute(text("DELETE FROM objects WHERE id = CAST(:src AS UUID)"), p)
    props = merged_tenant_properties(dict(target["properties"] or {}), [dict(s["properties"] or {}) for s in sources])
    owner = target["owner"] or next((s["owner"] for s in sources if s["owner"]), None)
    team = target["owner_team_id"] or next((s["owner_team_id"] for s in sources if s["owner_team_id"]), None)
    await db.execute(text("UPDATE objects SET properties = CAST(:props AS JSONB), owner = :owner, owner_team_id = :team, updated_at = now() WHERE id = CAST(:into AS UUID)"),
                     {**p_base, "props": json.dumps(props), "owner": owner, "team": team})
    await _dirty(db, workspace_id)
    await db.commit()
    return len(sources)


TENANT_TEXT = ("tenant_id", "annual_cost")


async def list_tenants(db: AsyncSession, workspace_id: uuid.UUID) -> list[dict[str, Any]]:
    """Every platform record (cloud_service) with its provider and how many apps run on it."""
    rows = (await db.execute(text(
        "SELECT x.id, x.name, x.owner, x.properties,"
        " (SELECT count(DISTINCT r.from_object_id) FROM relationships r WHERE r.workspace_id = x.workspace_id"
        "  AND r.to_object_id = x.id AND r.type IN ('runs_on','built_on')) AS usage"
        " FROM objects x WHERE x.workspace_id = :ws AND x.type = 'cloud_service' ORDER BY lower(x.name)"
    ), {"ws": workspace_id})).mappings().all()
    out = []
    for r in rows:
        props = dict(r["properties"] or {})
        out.append({
            "id": str(r["id"]), "name": r["name"], "owner": r["owner"] or "",
            "provider": tenant_provider(props, r["name"]), "platform_kind": props.get("platform_kind") or "",
            "tenant_id": props.get("tenant_id") or "", "annual_cost": props.get("annual_cost") or "",
            "regions_used": [k for k in (props.get("regions_used") or []) if isinstance(k, str)],
            "usage": int(r["usage"] or 0),
        })
    return out


def duplicate_tenants(tenants: list[dict[str, Any]]) -> list[list[str]]:
    groups: dict[tuple[str, str], list[str]] = {}
    for t in tenants:
        groups.setdefault((t["provider"], clean_name(t["name"]).lower()), []).append(t["id"])
    return [ids for ids in groups.values() if len(ids) > 1]


def tenant_patch(current: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    """New properties for a tenant edit (provider, tenant ID, cost, regions used)."""
    props = dict(current or {})
    if "provider" in body:
        props["cloud_provider"] = provider_of(body["provider"])
    for key in TENANT_TEXT:
        if key in body:
            value = str(body[key] or "").strip()[:200]
            if value:
                props[key] = value
            else:
                props.pop(key, None)
    if "regions_used" in body:
        keys = body["regions_used"] or []
        if not isinstance(keys, list) or len(keys) > 100 or not all(valid_region_key(k) for k in keys):
            raise ValueError("regions_used must be a list of region keys.")
        props["regions_used"] = list(dict.fromkeys(keys))
    return props


async def update_tenant(db: AsyncSession, workspace_id: uuid.UUID, tenant_id: str, body: dict[str, Any]) -> None:
    row = (await db.execute(text("SELECT id, name, properties FROM objects WHERE id = CAST(:id AS UUID) AND workspace_id = :ws AND type = 'cloud_service'"),
                            {"id": tenant_id, "ws": workspace_id})).mappings().first()
    if not row:
        raise LookupError("Not found")
    sets: dict[str, Any] = {"props": json.dumps(tenant_patch(dict(row["properties"] or {}), body)), "id": tenant_id}
    extra = ""
    if "name" in body:
        name = clean_name(body["name"])
        if not name:
            raise ValueError("Name is required")
        clash = (await db.execute(text(
            "SELECT id FROM objects WHERE workspace_id = :ws AND type = 'cloud_service' AND id <> CAST(:id AS UUID)"
            " AND lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = :key LIMIT 1"), {"ws": workspace_id, "id": tenant_id, "key": name.lower()})).scalar_one_or_none()
        if clash:
            raise ValueError(f"“{name}” already exists. Merge them instead.")
        sets["name"], extra = name, ", name = :name"
    if "owner" in body:
        sets["owner"], extra = (str(body["owner"] or "").strip() or None), extra + ", owner = :owner"
    await db.execute(text(f"UPDATE objects SET properties = CAST(:props AS JSONB){extra}, updated_at = now() WHERE id = CAST(:id AS UUID)"), sets)
    await _dirty(db, workspace_id)
    await db.commit()


async def delete_tenant(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID | None, tenant_id: str) -> None:
    """Apps that ran on it lose the link (ON DELETE CASCADE) and show as Region not recorded / no tenant."""
    row = (await db.execute(text("SELECT id, name FROM objects WHERE id = CAST(:id AS UUID) AND workspace_id = :ws AND type = 'cloud_service'"),
                            {"id": tenant_id, "ws": workspace_id})).mappings().first()
    if not row:
        raise LookupError("Not found")
    await db.execute(text(
        "INSERT INTO change_log (workspace_id, org_id, object_id, object_type, action, diff, performed_by)"
        " VALUES (:ws, :org, CAST(:id AS UUID), 'cloud_service', 'deleted', CAST(:diff AS JSONB), :by)"
    ), {"ws": workspace_id, "org": org_id, "id": tenant_id, "by": user_id, "diff": json.dumps({"action_type": "deleted_object", "name": row["name"]})})
    await db.execute(text("DELETE FROM objects WHERE id = CAST(:id AS UUID)"), {"id": tenant_id})
    await _dirty(db, workspace_id)
    await db.commit()
