"""POST /orgs/{org}/catalog/lookup: AI suggestions for names the app catalogue doesn't know."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai.gemini_client import is_configured
from app.services import tool_lookup
from app.services.tenancy import TenancyContext, get_org_context

router = APIRouter(prefix="/orgs/{org_slug}/catalog", tags=["catalog"])


class LookupRequest(BaseModel):
    names: list[str] = Field(default_factory=list, max_length=50)


@router.post("/lookup")
async def catalog_lookup(body: LookupRequest, ctx: TenancyContext = Depends(get_org_context)) -> dict:
    """Any org member. Rate-limited per org; unknown on timeout or when AI isn't configured."""
    results = await tool_lookup.lookup(body.names, str(ctx.org_id), configured=is_configured())
    return {"results": results}
