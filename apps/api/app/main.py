from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings, effective_cors_origins, API_ROOT
from app.database import AsyncSessionLocal, check_db_connection, database_ssl_mode, engine
from app.models import *  # noqa: F401, F403 — registers all models with Base
from app.auth import init_firebase, firebase_credentials_status
from app.services.authorization import load_permission_cache
from app.routers import ai, auth, capability_map, data_layer, invites, journeys, objects, orgs, people, processes, products, relationships, webhooks, workspaces

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_firebase()
    try:
        async with AsyncSessionLocal() as db:
            await load_permission_cache(db)
    except Exception as exc:
        logger.warning("Permission cache not loaded (run db:migrate?): %s", exc)
    yield
    try:
        await engine.dispose()
    except Exception as exc:
        logger.warning("Engine dispose failed: %s", exc)


app = FastAPI(
    title="minEA API",
    version="0.1.0",
    description="Model-driven Enterprise Architecture for SMBs",
    lifespan=lifespan,
)


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database error")
    return JSONResponse(
        status_code=503,
        content={"detail": f"Database unavailable: {str(exc)[:200]}"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=effective_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(orgs.router, prefix="/api/v1")
app.include_router(invites.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")
app.include_router(objects.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(processes.router, prefix="/api/v1")
app.include_router(people.router, prefix="/api/v1")
app.include_router(data_layer.router, prefix="/api/v1")
app.include_router(capability_map.router, prefix="/api/v1")
app.include_router(journeys.router, prefix="/api/v1")
app.include_router(relationships.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    cred_ok, cred_path = firebase_credentials_status()
    db_ok, db_detail = await check_db_connection()
    firebase_error: str | None = None
    if not cred_ok:
        firebase_error = (
            "Set FIREBASE_SERVICE_ACCOUNT_JSON on Vercel (paste full service account JSON)."
        )
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "0.1.0",
        "firebase_configured": cred_ok,
        "firebase_credentials_path": str(cred_path) if cred_path else None,
        "firebase_error": firebase_error,
        "database_connected": db_ok,
        "database_detail": db_detail if not db_ok else None,
        "database_ssl_mode": database_ssl_mode(),
        "database_ssl_ca_configured": bool(settings.database_ssl_ca.strip()),
        "database_ssl_verify": settings.database_ssl_verify,
        "debug": settings.debug,
        "vercel": os.getenv("VERCEL") == "1",
    }
