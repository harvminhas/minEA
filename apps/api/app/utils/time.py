"""UTC datetime helpers for asyncpg / TIMESTAMPTZ compatibility."""
from datetime import UTC, datetime, timedelta


def utc_now() -> datetime:
    """Naive UTC datetime — safe for asyncpg TIMESTAMPTZ bind parameters."""
    return datetime.now(UTC).replace(tzinfo=None)


def as_utc_naive(dt: datetime) -> datetime:
    """Normalize aware or naive datetimes to naive UTC for comparisons."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(UTC).replace(tzinfo=None)


def utc_now_plus(days: int = 0, **kwargs) -> datetime:
    return utc_now() + timedelta(days=days, **kwargs)
