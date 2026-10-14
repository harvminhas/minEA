"""App catalogue: read for everyone signed in (ETag), edit for platform admins (PLATFORM_ADMIN_EMAILS)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, get_auth_context
from app.database import get_db
from app.services import tool_catalog as tc
from app.services.auth_status import get_auth_status

router = APIRouter(tags=["catalog"])


async def require_platform_admin(
    auth: AuthContext = Depends(get_auth_context), db: AsyncSession = Depends(get_db)
) -> AuthContext:
    if auth.email.strip().lower() not in tc.platform_admin_emails():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admins only")
    verified = bool((await get_auth_status(db, auth.firebase_uid))["email_verified"])
    if not tc.is_platform_admin(auth.email, verified):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admins only")
    return auth


@router.get("/catalog/tools")
async def read_tools(
    request: Request,
    response: Response,
    _auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
):
    tools, etag, source = await tc.load_tools(db)
    headers = {"ETag": etag, "Cache-Control": "private, max-age=300"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    for key, value in headers.items():
        response.headers[key] = value
    return {"version": etag, "source": source, "tools": tools}


@router.get("/platform/me")
async def platform_me(auth: AuthContext = Depends(get_auth_context), db: AsyncSession = Depends(get_db)) -> dict:
    """Whether to show the catalogue admin link (cheap: no Firebase call unless the email is listed)."""
    if auth.email.strip().lower() not in tc.platform_admin_emails():
        return {"platformAdmin": False}
    verified = bool((await get_auth_status(db, auth.firebase_uid))["email_verified"])
    return {"platformAdmin": tc.is_platform_admin(auth.email, verified)}


@router.get("/platform/catalog/entries")
async def list_entries(q: str = "", _admin=Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    await tc.seed_if_empty(db)
    key = f"%{tc.normalize(q)}%"
    rows = (await db.execute(
        text("SELECT * FROM tool_catalog_entries WHERE (:q = '' OR name_key LIKE :key OR aliases::text ILIKE :raw OR lower(vendor) LIKE :key OR lower(category) LIKE :key) ORDER BY name LIMIT 300"),
        {"q": q.strip(), "key": key, "raw": f"%{q.strip()}%"},
    )).all()
    total = (await db.execute(text("SELECT count(*) FROM tool_catalog_entries"))).scalar_one()
    return {"total": total, "entries": [{"id": str(row.id), **tc.row_to_tool(row)} for row in rows]}


async def _all_tools(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(text("SELECT * FROM tool_catalog_entries"))).all()
    return [tc.row_to_tool(row) for row in rows]


async def _write(db: AsyncSession, body: dict, admin: AuthContext, entry_id: str | None) -> dict:
    try:
        entry = tc.validate_entry(body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    current = None
    if entry_id:
        current = (await db.execute(text("SELECT * FROM tool_catalog_entries WHERE id = CAST(:id AS UUID)"), {"id": entry_id})).first()
        if not current:
            raise HTTPException(status_code=404, detail="Entry not found")
    clash = tc.collisions(entry, await _all_tools(db), skip_name_key=current.name_key if current else None)
    if clash:
        raise HTTPException(status_code=409, detail=f"Already used by another entry: {', '.join(clash[:5])}")
    params = {
        "name": entry["name"], "key": tc.normalize(entry["name"]), "aliases": json.dumps(entry["aliases"]),
        "vendor": entry["vendor"], "category": entry["category"], "hosting": entry["hosting"], "kind": entry["kind"],
        "typical": entry["typicalAnnual"], "sso": entry["ssoUsual"], "by": admin.email,
        "extra": json.dumps({"typicalPerSeatMonthly": entry["typicalPerSeatMonthly"]}),
    }
    if current:
        row = (await db.execute(text(
            "UPDATE tool_catalog_entries SET name=:name, name_key=:key, aliases=CAST(:aliases AS JSONB), vendor=:vendor, category=:category,"
            " hosting=:hosting, kind=:kind, typical_annual=:typical, sso_usual=:sso, extra = COALESCE(extra, '{}'::jsonb) || CAST(:extra AS JSONB), updated_by=:by, updated_at=now() WHERE id = CAST(:id AS UUID) RETURNING *"
        ), {**params, "id": entry_id})).first()
    else:
        row = (await db.execute(text(
            "INSERT INTO tool_catalog_entries (name, name_key, aliases, vendor, category, hosting, kind, typical_annual, sso_usual, extra, updated_by)"
            " VALUES (:name, :key, CAST(:aliases AS JSONB), :vendor, :category, :hosting, :kind, :typical, :sso, CAST(:extra AS JSONB), :by) RETURNING *"
        ), params)).first()
        await db.execute(text("DELETE FROM tool_catalog_misses WHERE name_key = :key"), {"key": params["key"]})
        for alias in entry["aliases"]:
            await db.execute(text("DELETE FROM tool_catalog_misses WHERE name_key = :key"), {"key": tc.normalize(alias)})
    await db.commit()
    tc.invalidate()
    return {"id": str(row.id), **tc.row_to_tool(row)}


@router.post("/platform/catalog/entries", status_code=201)
async def create_entry(body: dict, admin=Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    await tc.seed_if_empty(db)
    return await _write(db, body, admin, None)


@router.put("/platform/catalog/entries/{entry_id}")
async def update_entry(entry_id: str, body: dict, admin=Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await _write(db, body, admin, entry_id)


@router.delete("/platform/catalog/entries/{entry_id}", status_code=204)
async def delete_entry(entry_id: str, _admin=Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> Response:
    await db.execute(text("DELETE FROM tool_catalog_entries WHERE id = CAST(:id AS UUID)"), {"id": entry_id})
    await db.commit()
    tc.invalidate()
    return Response(status_code=204)


@router.get("/platform/catalog/misses")
async def list_misses(_admin=Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(text("SELECT name_key, sample, count, suggestion, last_seen FROM tool_catalog_misses ORDER BY count DESC, last_seen DESC LIMIT 50"))).all()
    return {"misses": [{"key": r.name_key, "name": r.sample, "count": r.count, "suggestion": r.suggestion, "lastSeen": r.last_seen.isoformat()} for r in rows]}


@router.delete("/platform/catalog/misses/{name_key}", status_code=204)
async def dismiss_miss(name_key: str, _admin=Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> Response:
    await db.execute(text("DELETE FROM tool_catalog_misses WHERE name_key = :key"), {"key": name_key})
    await db.commit()
    return Response(status_code=204)
