from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.models import *  # noqa: F401, F403 — registers all models with Base
from app.routers import ai, objects, relationships, webhooks, workspaces


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield
    await engine.dispose()


app = FastAPI(
    title="minEA API",
    version="0.1.0",
    description="Model-driven Enterprise Architecture for SMBs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(objects.router, prefix="/api/v1")
app.include_router(relationships.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
