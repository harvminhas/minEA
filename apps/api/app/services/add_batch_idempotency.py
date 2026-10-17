"""Idempotency-Key for POST .../objects/batch: a repeated Add (the browser gave up on a slow save and
the user clicked again) returns the first response instead of creating every item twice.

The key row is claimed inside the batch's own transaction with INSERT .. ON CONFLICT DO NOTHING.
A repeat sent while the first request is still running blocks on that unique key until the first
commits (then replays its stored result) or rolls back (then this one saves normally)."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

HEADER = "Idempotency-Key"
KEEP_DAYS = 7
_KEY = re.compile(r"^[A-Za-z0-9_.:\-]{8,128}$")
DIFFERENT_BODY = "This Add was already used for a different list. Refresh the page and add again."
STILL_SAVING = "This Add is still saving. Refresh the page in a minute before adding again."


@dataclass
class Claim:
    key: str | None = None
    owned: bool = False  # this request saves and must store its result
    replay: dict | None = None  # stored response of the first request with this key


def checked_key(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    key = raw.strip()
    if not _KEY.match(key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {HEADER} header")
    return key


def fingerprint(body: BaseModel) -> str:
    return hashlib.sha256(body.model_dump_json().encode()).hexdigest()


async def claim(
    db: AsyncSession,
    *,
    key: str | None,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    request_hash: str,
) -> Claim:
    if key is None:
        return Claim()
    try:
        async with db.begin_nested():
            inserted = (
                await db.execute(
                    text(
                        "INSERT INTO add_batch_requests (workspace_id, idempotency_key, org_id, request_hash, created_by) "
                        "VALUES (:w, :k, :o, :h, :u) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING RETURNING 1"
                    ),
                    {"w": workspace_id, "k": key, "o": org_id, "h": request_hash, "u": user_id},
                )
            ).scalar_one_or_none()
    except ProgrammingError:
        # 054 not applied yet: save without replay rather than fail the Add.
        logger.warning("add_batch_requests missing; Idempotency-Key ignored (apply migration 054)")
        return Claim(key=key)
    if inserted:
        return Claim(key=key, owned=True)
    row = (
        await db.execute(
            text(
                "SELECT request_hash, result FROM add_batch_requests "
                "WHERE workspace_id = :w AND idempotency_key = :k AND org_id = :o"
            ),
            {"w": workspace_id, "k": key, "o": org_id},
        )
    ).one_or_none()
    if row is None or row.request_hash != request_hash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DIFFERENT_BODY)
    if row.result is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=STILL_SAVING)
    return Claim(key=key, replay=row.result)


async def store(db: AsyncSession, claimed: Claim, *, workspace_id: UUID, result: BaseModel) -> None:
    """Save the response with the claimed key (same transaction as the batch) and prune old keys."""
    if not claimed.owned:
        return
    await db.execute(
        text(
            "UPDATE add_batch_requests SET result = :r WHERE workspace_id = :w AND idempotency_key = :k"
        ).bindparams(bindparam("r", type_=JSONB)),
        {"r": result.model_dump(mode="json"), "w": workspace_id, "k": claimed.key},
    )
    await db.execute(
        text(
            "DELETE FROM add_batch_requests WHERE workspace_id = :w "
            f"AND created_at < now() - interval '{KEEP_DAYS} days'"
        ),
        {"w": workspace_id},
    )
