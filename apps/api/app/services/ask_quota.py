"""Ask AI-question allowance: counted per org per calendar month (America/Toronto).

Each plan's allowance is ai_answers_per_month in plans.json (the same numbers the pricing page and
Plan & billing show: Free 25, Starter 500, Team 2500, Business 5000). Any org can be given its own
allowance with org_limits key "ai_questions_per_month" (how a Business org is configured).
Only questions that reach the model count; quick answers worked out in the browser never call here.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.authorization import get_org_limit
from app.services.plan_features import normalize_plan
from app.services.plans import PLAN_CATALOG

logger = logging.getLogger(__name__)

LIMIT_KEY = "ai_questions_per_month"
PLAN_AI_QUESTIONS: dict[str, int] = {key: int(plan["ai_answers_per_month"]) for key, plan in PLAN_CATALOG.items()}
TZ = ZoneInfo("America/Toronto")


@dataclass
class AskQuota:
    plan: str
    used: int
    limit: int
    month: str
    allowed: bool = True

    def as_dict(self) -> dict:
        return {"plan": self.plan, "used": self.used, "limit": self.limit, "month": self.month}


def month_key(now: datetime | None = None) -> str:
    return (now or datetime.now(TZ)).astimezone(TZ).strftime("%Y-%m")


async def monthly_limit(db: AsyncSession, org_id: uuid.UUID, plan: str) -> int:
    override = await get_org_limit(db, org_id, LIMIT_KEY)
    if override is not None:
        return max(int(override), 0)
    return PLAN_AI_QUESTIONS.get(normalize_plan(plan), PLAN_AI_QUESTIONS["free"])


async def read_quota(db: AsyncSession, org_id: uuid.UUID, plan: str, now: datetime | None = None) -> AskQuota:
    month = month_key(now)
    used = (
        await db.execute(text("SELECT used FROM ai_question_usage WHERE org_id = :o AND month = :m"), {"o": org_id, "m": month})
    ).scalar_one_or_none() or 0
    return AskQuota(plan=normalize_plan(plan), used=int(used), limit=await monthly_limit(db, org_id, plan), month=month)


async def take_question(db: AsyncSession, org_id: uuid.UUID, plan: str, now: datetime | None = None) -> AskQuota:
    """Count one AI question if the org is under its allowance. One statement, so two questions at
    once can't both take the last one. allowed=False (nothing counted) when the month is used up."""
    month = month_key(now)
    limit = await monthly_limit(db, org_id, plan)
    try:
        row = await _increment(db, org_id, month, limit)
    except ProgrammingError:
        # 053 not applied yet: answer (fail open) rather than break Ask; logged so it's noticed.
        await db.rollback()
        logger.warning("ai_question_usage missing; Ask questions not counted (apply migration 053)")
        return AskQuota(plan=normalize_plan(plan), used=0, limit=limit, month=month)
    if row is None:
        quota = await read_quota(db, org_id, plan, now)
        quota.allowed = False
        return quota
    return AskQuota(plan=normalize_plan(plan), used=int(row), limit=limit, month=month)


async def _increment(db: AsyncSession, org_id: uuid.UUID, month: str, limit: int) -> int | None:
    return (
        await db.execute(
            text(
                "INSERT INTO ai_question_usage (org_id, month, used) SELECT :o, :m, 1 WHERE :lim > 0 "
                "ON CONFLICT (org_id, month) DO UPDATE SET used = ai_question_usage.used + 1, updated_at = now() "
                "WHERE ai_question_usage.used < :lim RETURNING used"
            ),
            {"o": org_id, "m": month, "lim": limit},
        )
    ).scalar_one_or_none()
