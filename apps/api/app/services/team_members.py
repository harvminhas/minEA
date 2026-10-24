"""Team membership (057 team_members). people_contacts.team_id stays the person's primary team for older
readers: joining a first team sets it, leaving the primary team moves it to another membership (or clears it)."""
from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def add_member(db: AsyncSession, team_id: uuid.UUID, contact_id: uuid.UUID, title: str | None = None) -> None:
    await db.execute(
        text(
            "INSERT INTO team_members (team_id, contact_id, title) VALUES (:t, :c, :title)"
            " ON CONFLICT (team_id, contact_id) DO UPDATE SET title = COALESCE(EXCLUDED.title, team_members.title)"
        ),
        {"t": team_id, "c": contact_id, "title": (title or "").strip() or None},
    )
    await db.execute(
        text("UPDATE people_contacts SET team_id = :t WHERE id = :c AND team_id IS NULL"), {"t": team_id, "c": contact_id}
    )


async def set_title(db: AsyncSession, team_id: uuid.UUID, contact_id: uuid.UUID, title: str | None) -> bool:
    res = await db.execute(
        text("UPDATE team_members SET title = :title WHERE team_id = :t AND contact_id = :c"),
        {"t": team_id, "c": contact_id, "title": (title or "").strip() or None},
    )
    return res.rowcount > 0


async def remove_member(db: AsyncSession, team_id: uuid.UUID, contact_id: uuid.UUID) -> bool:
    res = await db.execute(text("DELETE FROM team_members WHERE team_id = :t AND contact_id = :c"), {"t": team_id, "c": contact_id})
    await db.execute(
        text(
            "UPDATE people_contacts SET team_id = (SELECT m.team_id FROM team_members m WHERE m.contact_id = :c"
            " ORDER BY m.created_at LIMIT 1) WHERE id = :c AND team_id = :t"
        ),
        {"t": team_id, "c": contact_id},
    )
    return res.rowcount > 0


async def set_primary(db: AsyncSession, contact_id: uuid.UUID, old_team_id: uuid.UUID | None, new_team_id: uuid.UUID | None) -> None:
    """An older screen changed people_contacts.team_id: treat it as a move from the old primary team."""
    if old_team_id == new_team_id:
        return
    if old_team_id:
        await db.execute(text("DELETE FROM team_members WHERE team_id = :t AND contact_id = :c"), {"t": old_team_id, "c": contact_id})
    if new_team_id:
        await db.execute(
            text("INSERT INTO team_members (team_id, contact_id) VALUES (:t, :c) ON CONFLICT DO NOTHING"),
            {"t": new_team_id, "c": contact_id},
        )


async def teams_of(db: AsyncSession, contact_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[dict]]:
    """contact id -> [{id, name, title}] A–Z."""
    if not contact_ids:
        return {}
    rows = await db.execute(
        text(
            "SELECT m.contact_id, t.id, t.name, m.title FROM team_members m JOIN teams t ON t.id = m.team_id"
            " WHERE m.contact_id = ANY(:ids) ORDER BY lower(t.name)"
        ),
        {"ids": contact_ids},
    )
    out: dict[uuid.UUID, list[dict]] = {}
    for contact_id, team_id, name, title in rows.all():
        out.setdefault(contact_id, []).append({"id": team_id, "name": name, "title": title})
    return out


async def members_of(db: AsyncSession, team_id: uuid.UUID) -> list[dict]:
    rows = await db.execute(
        text(
            "SELECT c.id, c.name, c.email, m.title, c.title AS job_title FROM team_members m"
            " JOIN people_contacts c ON c.id = m.contact_id WHERE m.team_id = :t ORDER BY lower(c.name)"
        ),
        {"t": team_id},
    )
    return [
        {"contact_id": r.id, "name": r.name, "email": r.email, "title": r.title, "job_title": r.job_title}
        for r in rows.all()
    ]


async def member_counts(db: AsyncSession, team_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not team_ids:
        return {}
    rows = await db.execute(
        text("SELECT team_id, count(*) FROM team_members WHERE team_id = ANY(:ids) GROUP BY team_id"), {"ids": team_ids}
    )
    return {t: n for t, n in rows.all()}
