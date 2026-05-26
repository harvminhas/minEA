from collections.abc import AsyncGenerator
import os
import ssl

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings


def database_ssl_mode() -> str:
    """Which TLS mode is active — surfaced on /health for deployment debugging."""
    if not settings.database_ssl:
        return "off"
    ca = settings.database_ssl_ca.strip()
    if ca and "BEGIN CERTIFICATE" in ca:
        return "ca"
    if not settings.database_ssl_verify:
        return "insecure"
    return "system"


def _build_ssl_context() -> ssl.SSLContext:
    ca = settings.database_ssl_ca.strip()
    if ca and "BEGIN CERTIFICATE" in ca:
        ctx = ssl.create_default_context()
        ctx.load_verify_locations(cadata=ca)
        # Cloud SQL public IP connections use the IP, not the cert CN.
        ctx.check_hostname = False
        return ctx

    if not settings.database_ssl_verify:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    return ctx


_connect_args: dict = {}
if settings.database_ssl:
    _connect_args["ssl"] = _build_ssl_context()

# Vercel Functions are short-lived — avoid a large connection pool per instance.
_engine_kwargs: dict = {
    "echo": settings.debug,
    "connect_args": _connect_args,
}
if os.getenv("VERCEL") == "1":
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20

engine = create_async_engine(settings.database_url, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def check_db_connection() -> tuple[bool, str]:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True, "connected"
    except Exception as exc:
        return False, str(exc)[:200]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
