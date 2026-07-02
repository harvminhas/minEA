"""
AI Insights — tool-calling agent that queries the architecture model via functions,
then returns structured gap/risk/recommendation insights.
"""
from __future__ import annotations

import json
import uuid

from google.genai import types
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.architecture_tools import ARCHITECTURE_TOOLS, execute_tool
from app.ai.gemini_client import build_gemini_tools, get_client, is_configured, model_name
from app.ai.prompts import INSIGHTS_SYSTEM
from app.models.insights import AiInsight
from app.services.architecture_gaps import compute_architecture_gaps

MAX_TOOL_ROUNDS = 3

INITIAL_PROMPT = (
    "Analyse this workspace architecture. Use the available tools to query domains, "
    "capabilities, systems, products, roadmap items, and relationships. "
    "Start with get_architecture_gaps and get_workspace_summary, then drill into "
    "anything surprising. When done, output ONLY the final JSON insights object — "
    "no markdown fences."
)


def _parse_insights_json(raw: str) -> list[dict]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    return data.get("insights", []) if isinstance(data, dict) else []


def _normalize_severity(value: str | None) -> str | None:
    if not value:
        return None
    mapping = {"critical": "high", "warning": "medium", "info": "low"}
    return mapping.get(value, value)


async def _run_insights_agent(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[dict]:
    """Run the tool-calling agent and return parsed insight dicts."""
    if not is_configured():
        return await compute_architecture_gaps(db, workspace_id, org_id)

    tools = build_gemini_tools(ARCHITECTURE_TOOLS)
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part.from_text(text=INITIAL_PROMPT)])
    ]

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = await get_client().aio.models.generate_content(
                model=model_name(),
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=INSIGHTS_SYSTEM,
                    tools=tools,
                    max_output_tokens=4096,
                ),
            )
        except Exception:
            break

        try:
            if response.function_calls:
                if response.candidates and response.candidates[0].content:
                    contents.append(response.candidates[0].content)

                tool_parts: list[types.Part] = []
                for function_call in response.function_calls:
                    args = function_call.function_call.args if function_call.function_call else {}
                    if not isinstance(args, dict):
                        args = dict(args) if args else {}
                    result = await execute_tool(
                        function_call.name or "",
                        args,
                        db,
                        workspace_id,
                        org_id,
                    )
                    serialized = json.loads(json.dumps(result, default=str))
                    tool_parts.append(
                        types.Part.from_function_response(
                            name=function_call.name or "",
                            response={"result": serialized},
                        )
                    )

                if not tool_parts:
                    break
                contents.append(types.Content(role="tool", parts=tool_parts))
                continue

            if response.text:
                insights = _parse_insights_json(response.text)
                if insights:
                    return insights
        except Exception:
            break
        break

    return await compute_architecture_gaps(db, workspace_id, org_id)


def _gap_dedupe_key(item: dict) -> str:
    title = (item.get("title") or "").lower()
    if "domain" in title and "capabilit" in title:
        return "domains-without-capabilities"
    if "capabilit" in title and "system" in title:
        return "capabilities-without-system"
    if "capabilit" in title and "owner" in title:
        return "capabilities-without-owner"
    if "product" in title and "capabilit" in title:
        return "products-without-capabilities"
    if "investment" in title and "unlink" in title:
        return "investments-unlinked"
    return title.strip()


async def _persist_insights(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    raw_insights: list[dict],
) -> list[AiInsight]:
    insights: list[AiInsight] = []
    seen_keys: set[str] = set()
    for item in raw_insights:
        key = _gap_dedupe_key(item)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        if len(insights) >= 15:
            break
        examples = item.get("examples") or []
        impact_note = item.get("impact_note") or item.get("description") or ""
        insight = AiInsight(
            workspace_id=workspace_id,
            org_id=org_id,
            type=item.get("type", "gap"),
            title=item.get("title", ""),
            description=impact_note,
            severity=_normalize_severity(item.get("severity")),
            affected_object_ids=item.get("affected_object_ids") or [],
            raw_response={**item, "examples": examples, "impact_note": impact_note},
        )
        db.add(insight)
        insights.append(insight)
    await db.commit()
    return insights


async def generate_insights(
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> list[AiInsight]:
    """Generate AI insights for a workspace and persist them."""
    try:
        await db.execute(
            delete(AiInsight).where(
                AiInsight.workspace_id == workspace_id,
                AiInsight.org_id == org_id,
            )
        )
        raw_insights = await _run_insights_agent(db, workspace_id, org_id)
        return await _persist_insights(db, workspace_id, org_id, raw_insights)
    except Exception:
        await db.rollback()
        raw_insights = await compute_architecture_gaps(db, workspace_id, org_id)
        await db.execute(
            delete(AiInsight).where(
                AiInsight.workspace_id == workspace_id,
                AiInsight.org_id == org_id,
            )
        )
        return await _persist_insights(db, workspace_id, org_id, raw_insights)


def insight_to_dict(insight: AiInsight) -> dict:
    raw = insight.raw_response or {}
    return {
        "id": str(insight.id),
        "type": insight.type,
        "title": insight.title,
        "description": insight.description,
        "severity": insight.severity,
        "examples": raw.get("examples") or [],
        "impact_note": raw.get("impact_note") or insight.description,
        "affected_object_ids": insight.affected_object_ids or [],
        "created_at": insight.created_at.isoformat(),
    }
