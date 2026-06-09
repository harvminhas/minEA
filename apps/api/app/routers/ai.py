import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chat import stream_chat
from app.ai.ingestion import extract_from_text
from app.ai.insights import generate_insights, insight_to_dict
from app.database import get_db
from app.models.insights import AiInsight
from app.models.objects import MinEAObject
from app.models.relationships import Relationship
from app.routers.workspaces import build_workspace_context_graph
from app.schemas.relationships import ALLOWED_TRIPLES
from app.services.audit import log_audit
from app.services.authorization import require_limit
from app.services.plan_features import assert_plan_allows_ai_chat
from app.services.tenancy import TenancyContext, get_workspace_context

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_slug}/ai",
    tags=["ai"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class IngestRequest(BaseModel):
    text: str


@router.post("/chat")
async def chat(
    body: ChatRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await ctx.require_read(db)
    assert_plan_allows_ai_chat(ctx.org.plan)
    context = await build_workspace_context_graph(ctx, db)

    return StreamingResponse(
        stream_chat(context, [m.model_dump() for m in body.messages]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/ingest")
async def ingest(
    body: IngestRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await ctx.require_permission(db, "extraction.run")
    await require_limit(db, ctx.org_id, "ai_extractions_per_month", pending_delta=1)
    payload = await extract_from_text(body.text)
    await log_audit(
        db,
        org_id=ctx.org_id,
        actor_user_id=ctx.user_id,
        action="extraction.run",
        target_type="workspace",
        target_id=ctx.workspace.id if ctx.workspace else None,
    )
    await db.commit()
    return payload.model_dump()


class IngestCommitItem(BaseModel):
    local_id: str
    type: str
    name: str
    description: str | None = None
    properties: dict = {}


class IngestCommitRelationship(BaseModel):
    type: str
    from_local_id: str
    to_local_id: str
    attributes: dict = {}


class IngestCommitRequest(BaseModel):
    objects: list[IngestCommitItem]
    relationships: list[IngestCommitRelationship]


@router.post("/ingest/commit")
async def ingest_commit(
    body: IngestCommitRequest,
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await ctx.require_permission(db, "object.create")
    assert ctx.workspace

    local_id_to_db_id: dict[str, uuid.UUID] = {}
    created_objects = []

    for item in body.objects:
        obj = MinEAObject(
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            type=item.type,
            name=item.name,
            description=item.description,
            properties=item.properties,
            source="ai_extraction",
            confidence=0.85,
            created_by=ctx.user_id,
        )
        db.add(obj)
        await db.flush()
        local_id_to_db_id[item.local_id] = obj.id
        created_objects.append(str(obj.id))

    created_rels = []
    for rel in body.relationships:
        from_id = local_id_to_db_id.get(rel.from_local_id)
        to_id = local_id_to_db_id.get(rel.to_local_id)
        if not from_id or not to_id:
            continue

        from_obj = next((o for o in body.objects if o.local_id == rel.from_local_id), None)
        to_obj = next((o for o in body.objects if o.local_id == rel.to_local_id), None)
        if not from_obj or not to_obj:
            continue

        triple = (rel.type, from_obj.type, to_obj.type)
        if triple not in ALLOWED_TRIPLES:
            continue

        r = Relationship(
            workspace_id=ctx.workspace.id,
            org_id=ctx.org_id,
            type=rel.type,
            from_object_id=from_id,
            from_type=from_obj.type,
            to_object_id=to_id,
            to_type=to_obj.type,
            attributes=rel.attributes,
            created_by=ctx.user_id,
        )
        db.add(r)
        created_rels.append(str(r.id))

    await db.commit()
    return {"created_objects": created_objects, "created_relationships": created_rels}


@router.post("/insights/generate")
async def trigger_insights(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await ctx.require_permission(db, "extraction.run")
    assert ctx.workspace
    insights = await generate_insights(ctx.workspace.id, ctx.org_id, db)
    return {"generated": len(insights)}


@router.get("/insights")
async def list_insights(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await ctx.require_read(db)
    assert ctx.workspace

    result = await db.execute(
        select(AiInsight)
        .where(
            AiInsight.workspace_id == ctx.workspace.id,
            AiInsight.org_id == ctx.org_id,
        )
        .order_by(AiInsight.created_at.desc())
    )
    insights = result.scalars().all()
    analysed_at = insights[0].created_at.isoformat() if insights else None
    return {
        "insights": [insight_to_dict(i) for i in insights],
        "analysed_at": analysed_at,
        "count": len(insights),
    }


@router.get("/governance/pii-agents")
async def pii_agents(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await ctx.require_read(db)
    assert ctx.workspace

    pii_data_objects_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.type == "data_object",
            MinEAObject.properties["classification"].astext == "pii",
        )
    )
    pii_obj_ids = {str(o.id) for o in pii_data_objects_result.scalars().all()}
    if not pii_obj_ids:
        return []

    tool_rels_result = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == ctx.workspace.id,
            Relationship.type == "accesses",
            Relationship.to_object_id.in_([uuid.UUID(oid) for oid in pii_obj_ids]),
        )
    )
    tool_ids = {str(r.from_object_id) for r in tool_rels_result.scalars().all()}
    if not tool_ids:
        return []

    agent_rels_result = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == ctx.workspace.id,
            Relationship.type == "can_call",
            Relationship.to_object_id.in_([uuid.UUID(tid) for tid in tool_ids]),
        )
    )
    agent_ids = {str(r.from_object_id) for r in agent_rels_result.scalars().all()}
    if not agent_ids:
        return []

    agents_result = await db.execute(
        select(MinEAObject).where(MinEAObject.id.in_([uuid.UUID(aid) for aid in agent_ids]))
    )
    agents = agents_result.scalars().all()
    return [{"id": str(a.id), "name": a.name, "properties": a.properties} for a in agents]


@router.get("/governance/autonomous-risks")
async def autonomous_risks(
    ctx: TenancyContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await ctx.require_read(db)
    assert ctx.workspace

    autonomous_agents_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.workspace_id == ctx.workspace.id,
            MinEAObject.type == "agent",
            MinEAObject.properties["autonomy_level"].astext == "act_autonomously",
        )
    )
    autonomous_agents = autonomous_agents_result.scalars().all()
    agent_ids = [a.id for a in autonomous_agents]
    if not agent_ids:
        return []

    tool_rels_result = await db.execute(
        select(Relationship).where(
            Relationship.workspace_id == ctx.workspace.id,
            Relationship.type == "can_call",
            Relationship.from_object_id.in_(agent_ids),
        )
    )
    tool_ids = {str(r.to_object_id) for r in tool_rels_result.scalars().all()}
    if not tool_ids:
        return []

    irreversible_tools_result = await db.execute(
        select(MinEAObject).where(
            MinEAObject.id.in_([uuid.UUID(tid) for tid in tool_ids]),
            MinEAObject.properties["reversibility"].astext == "irreversible",
        )
    )
    irreversible_tools = irreversible_tools_result.scalars().all()
    return [{"id": str(t.id), "name": t.name, "properties": t.properties} for t in irreversible_tools]
