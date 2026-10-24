"""Org settings > People & teams: list, add, rename, merge, delete and edit owner teams, named
owners (people_contacts) and roles. These live per workspace (workspace_id NOT NULL in 013/035),
so every call names one workspace of the org; org admins manage all of them.

Raw SQL on purpose: phone/title/notes (migration 050) are read only here, so the ORM models (and
every other screen) keep working before 050 is applied.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

OWNABLE_TABLES = ("objects", "products", "processes", "stages", "customer_journeys", "journey_moments")
KINDS = ("team", "person", "role")
ROLE_KINDS = ("owner", "performer", "steward")


def clean_name(value: Any) -> str:
    return " ".join(str(value or "").split())[:200]


def name_key(value: Any) -> str:
    return clean_name(value).lower()


def duplicate_groups(rows: list[dict[str, Any]]) -> list[list[str]]:
    """Ids of rows whose names differ only in case/spaces (merge candidates)."""
    groups: dict[str, list[str]] = {}
    for row in rows:
        groups.setdefault(name_key(row["name"]), []).append(row["id"])
    return [ids for ids in groups.values() if len(ids) > 1]


def _usage_sql(kind: str) -> str:
    if kind == "team":
        parts = [f"(SELECT count(*) FROM {t} WHERE owner_team_id = x.id)" for t in OWNABLE_TABLES]
        parts += ["(SELECT count(*) FROM team_members m WHERE m.team_id = x.id)",
                  "(SELECT count(*) FROM people_accountabilities a WHERE a.subject_type = 'team' AND a.subject_id = x.id)"]
    elif kind == "person":
        parts = [f"(SELECT count(*) FROM {t} WHERE point_of_contact_id = x.id)" for t in OWNABLE_TABLES]
    else:
        parts = ["(SELECT count(*) FROM team_role_assignments r WHERE r.people_role_id = x.id)",
                 "(SELECT count(*) FROM people_accountabilities a WHERE a.subject_type = 'role' AND a.subject_id = x.id)"]
    return " + ".join(parts)


def _table(kind: str) -> str:
    return {"team": "teams", "person": "people_contacts", "role": "people_roles"}[kind]


async def contact_extras_available(db: AsyncSession) -> bool:
    row = await db.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_name = 'people_contacts' AND column_name IN ('phone','title','notes')"
    ))
    return row.scalar_one() == 3


async def list_directory(db: AsyncSession, workspace_id: uuid.UUID) -> dict[str, Any]:
    extras = await contact_extras_available(db)
    ws = {"ws": workspace_id}
    teams = (await db.execute(text(
        f"SELECT x.id, x.name, x.description, x.lead_name, x.lead_email, ({_usage_sql('team')}) AS usage"
        " FROM teams x WHERE x.workspace_id = :ws ORDER BY lower(x.name)"), ws)).mappings().all()
    person_cols = "x.phone, x.title, x.notes" if extras else "NULL AS phone, NULL AS title, NULL AS notes"
    people = (await db.execute(text(
        f"SELECT x.id, x.name, x.email, {person_cols}, x.team_id, t.name AS team_name, ({_usage_sql('person')}) AS usage"
        " FROM people_contacts x LEFT JOIN teams t ON t.id = x.team_id WHERE x.workspace_id = :ws ORDER BY lower(x.name)"), ws)).mappings().all()
    roles = (await db.execute(text(
        f"SELECT x.id, x.name, x.role_kind, x.description, ({_usage_sql('role')}) AS usage"
        " FROM people_roles x WHERE x.workspace_id = :ws AND x.retired_at IS NULL ORDER BY lower(x.name)"), ws)).mappings().all()
    as_list = lambda rows: [{**{k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in dict(r).items()}} for r in rows]  # noqa: E731
    t, p, r = as_list(teams), as_list(people), as_list(roles)
    return {
        "teams": t, "people": p, "roles": r, "contactExtras": extras,
        "duplicates": {"team": duplicate_groups(t), "person": duplicate_groups(p), "role": duplicate_groups(r)},
    }


async def find_by_name(db: AsyncSession, kind: str, workspace_id: uuid.UUID, name: str) -> str | None:
    row = await db.execute(text(
        f"SELECT id FROM {_table(kind)} WHERE workspace_id = :ws AND lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = :key ORDER BY created_at LIMIT 1"
    ), {"ws": workspace_id, "key": name_key(name)})
    found = row.scalar_one_or_none()
    return str(found) if found else None


async def create(db: AsyncSession, kind: str, workspace_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID | None, body: dict[str, Any]) -> tuple[str, bool]:
    """(id, created). An existing name (case/space-insensitive) is reused, never duplicated."""
    if kind == "role":
        raise ValueError("Roles are retired. Give the person a title, or use the ownership roles on the record.")
    name = clean_name(body.get("name"))
    if not name:
        raise ValueError("Name is required")
    existing = await find_by_name(db, kind, workspace_id, name)
    if existing:
        return existing, False
    params = {"ws": workspace_id, "org": org_id, "name": name, "by": user_id}
    if kind == "team":
        sql = "INSERT INTO teams (workspace_id, org_id, name, description, created_by) VALUES (:ws, :org, :name, :d, :by) RETURNING id"
        params["d"] = (body.get("description") or None)
    elif kind == "person":
        sql = "INSERT INTO people_contacts (workspace_id, org_id, name, email, created_by) VALUES (:ws, :org, :name, :email, :by) RETURNING id"
        params["email"] = (body.get("email") or None)
    else:
        kind_value = body.get("role_kind") or "owner"
        if kind_value not in ROLE_KINDS:
            raise ValueError("Role kind must be owner, performer or steward")
        sql = "INSERT INTO people_roles (workspace_id, org_id, name, role_kind, description, created_by) VALUES (:ws, :org, :name, :rk, :d, :by) RETURNING id"
        params.update(rk=kind_value, d=body.get("description") or None)
    new_id = (await db.execute(text(sql), params)).scalar_one()
    await db.commit()
    return str(new_id), True


async def _row(db: AsyncSession, kind: str, workspace_id: uuid.UUID, row_id: str):
    return (await db.execute(text(f"SELECT * FROM {_table(kind)} WHERE id = CAST(:id AS UUID) AND workspace_id = :ws"),
                             {"id": row_id, "ws": workspace_id})).mappings().first()


async def update(db: AsyncSession, kind: str, workspace_id: uuid.UUID, row_id: str, body: dict[str, Any]) -> None:
    """Rename and edit attributes. A rename also updates the names shown on owned records."""
    current = await _row(db, kind, workspace_id, row_id)
    if not current:
        raise LookupError("Not found")
    sets: dict[str, Any] = {}
    if "name" in body:
        name = clean_name(body["name"])
        if not name:
            raise ValueError("Name is required")
        clash = await find_by_name(db, kind, workspace_id, name)
        if clash and clash != row_id:
            raise ValueError(f"“{name}” already exists. Merge them instead.")
        sets["name"] = name
    allowed = {"team": ("description", "lead_name", "lead_email"), "person": ("email", "phone", "title", "notes", "team_id"), "role": ("description", "role_kind")}[kind]
    for key in allowed:
        if key in body:
            value = body[key]
            sets[key] = (str(value).strip() or None) if value is not None else None
    if kind == "role" and sets.get("role_kind") not in (None, *ROLE_KINDS):
        raise ValueError("Role kind must be owner, performer or steward")
    if not sets:
        return
    assignments = ", ".join(f"{key} = CAST(:{key} AS UUID)" if key == "team_id" else f"{key} = :{key}" for key in sets)
    await db.execute(text(f"UPDATE {_table(kind)} SET {assignments}, updated_at = now() WHERE id = CAST(:id AS UUID)"), {**sets, "id": row_id})
    if kind == "person" and "team_id" in sets:
        from app.services.team_members import set_primary

        new_team = uuid.UUID(sets["team_id"]) if sets["team_id"] else None
        await set_primary(db, uuid.UUID(row_id), current["team_id"], new_team)
    if "name" in sets and kind == "team":
        for table in OWNABLE_TABLES:
            await db.execute(text(f"UPDATE {table} SET owner = :name WHERE owner_team_id = CAST(:id AS UUID)"), {"name": sets["name"], "id": row_id})
    if "name" in sets and kind == "person":
        for table in OWNABLE_TABLES:
            await db.execute(text(f"UPDATE {table} SET point_of_contact_name = :name WHERE point_of_contact_id = CAST(:id AS UUID)"), {"name": sets["name"], "id": row_id})
    await db.commit()


async def merge(db: AsyncSession, kind: str, workspace_id: uuid.UUID, into_id: str, from_ids: list[str]) -> int:
    """Point everything at `into_id`, fill its empty attributes from the others, delete the others."""
    target = await _row(db, kind, workspace_id, into_id)
    if not target:
        raise LookupError("Not found")
    sources = [i for i in dict.fromkeys(from_ids) if i != into_id]
    for source_id in sources:
        source = await _row(db, kind, workspace_id, source_id)
        if not source:
            raise LookupError("Not found")
        p = {"into": into_id, "src": source_id, "name": target["name"]}
        if kind == "team":
            for table in OWNABLE_TABLES:
                await db.execute(text(f"UPDATE {table} SET owner_team_id = CAST(:into AS UUID), owner = :name WHERE owner_team_id = CAST(:src AS UUID)"), p)
            await db.execute(text("UPDATE people_contacts SET team_id = CAST(:into AS UUID) WHERE team_id = CAST(:src AS UUID)"), p)
            await db.execute(text(
                "INSERT INTO team_members (team_id, contact_id, title) SELECT CAST(:into AS UUID), contact_id, title"
                " FROM team_members WHERE team_id = CAST(:src AS UUID) ON CONFLICT DO NOTHING"), p)
            await db.execute(text(
                "UPDATE team_role_assignments a SET team_id = CAST(:into AS UUID) WHERE a.team_id = CAST(:src AS UUID)"
                " AND NOT EXISTS (SELECT 1 FROM team_role_assignments b WHERE b.team_id = CAST(:into AS UUID) AND b.people_role_id = a.people_role_id)"), p)
            await _move_accountabilities(db, "team", p)
            await db.execute(text("UPDATE teams SET description = COALESCE(description, :d), lead_name = COALESCE(lead_name, :ln), lead_email = COALESCE(lead_email, :le) WHERE id = CAST(:into AS UUID)"),
                             {**p, "d": source["description"], "ln": source["lead_name"], "le": source["lead_email"]})
        elif kind == "person":
            for table in OWNABLE_TABLES:
                await db.execute(text(f"UPDATE {table} SET point_of_contact_id = CAST(:into AS UUID), point_of_contact_name = :name WHERE point_of_contact_id = CAST(:src AS UUID)"), p)
            fills = {k: source.get(k) for k in ("email", "phone", "title", "notes", "team_id") if k in source}
            if fills:
                sets = ", ".join(f"{k} = COALESCE({k}, CAST(:{k} AS UUID))" if k == "team_id" else f"{k} = COALESCE({k}, :{k})" for k in fills)
                await db.execute(text(f"UPDATE people_contacts SET {sets} WHERE id = CAST(:into AS UUID)"), {**p, **{k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in fills.items()}})
            await db.execute(text(
                "INSERT INTO team_members (team_id, contact_id, title) SELECT team_id, CAST(:into AS UUID), title"
                " FROM team_members WHERE contact_id = CAST(:src AS UUID) ON CONFLICT DO NOTHING"), p)
            await db.execute(text("UPDATE teams SET lead_contact_id = CAST(:into AS UUID) WHERE lead_contact_id = CAST(:src AS UUID)"), p)
            await _move_accountabilities(db, "contact", p)
        else:
            await db.execute(text(
                "UPDATE team_role_assignments a SET people_role_id = CAST(:into AS UUID) WHERE a.people_role_id = CAST(:src AS UUID)"
                " AND NOT EXISTS (SELECT 1 FROM team_role_assignments b WHERE b.people_role_id = CAST(:into AS UUID) AND b.team_id = a.team_id)"), p)
            await _move_accountabilities(db, "role", p)
        await db.execute(text(f"DELETE FROM {_table(kind)} WHERE id = CAST(:src AS UUID)"), p)
    await db.commit()
    return len(sources)


async def _move_accountabilities(db: AsyncSession, subject: str, p: dict[str, Any]) -> None:
    await db.execute(text(
        "UPDATE people_accountabilities a SET subject_id = CAST(:into AS UUID) WHERE a.subject_type = :s AND a.subject_id = CAST(:src AS UUID)"
        " AND NOT EXISTS (SELECT 1 FROM people_accountabilities b WHERE b.subject_type = :s AND b.subject_id = CAST(:into AS UUID)"
        " AND b.entity_kind = a.entity_kind AND b.entity_id = a.entity_id AND b.link_kind = a.link_kind)"), {**p, "s": subject})
    await db.execute(text("DELETE FROM people_accountabilities WHERE subject_type = :s AND subject_id = CAST(:src AS UUID)"), {**p, "s": subject})


async def usage(db: AsyncSession, kind: str, row_id: str) -> int:
    return int((await db.execute(text(f"SELECT ({_usage_sql(kind)}) FROM {_table(kind)} x WHERE x.id = CAST(:id AS UUID)"), {"id": row_id})).scalar_one_or_none() or 0)


async def delete(db: AsyncSession, kind: str, workspace_id: uuid.UUID, row_id: str) -> None:
    """Owned records keep their shown name; their link is cleared by ON DELETE SET NULL / CASCADE."""
    if not await _row(db, kind, workspace_id, row_id):
        raise LookupError("Not found")
    # subject_id has no FK, so clear the person's/team's/role's links here or they outlive it.
    subject = "contact" if kind == "person" else kind
    await db.execute(text("DELETE FROM people_accountabilities WHERE subject_type = :s AND subject_id = CAST(:id AS UUID)"), {"s": subject, "id": row_id})
    await db.execute(text(f"DELETE FROM {_table(kind)} WHERE id = CAST(:id AS UUID)"), {"id": row_id})
    await db.commit()
