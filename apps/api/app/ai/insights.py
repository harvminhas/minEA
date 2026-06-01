"""
AI Insights — tool-calling agent that queries the architecture model via functions,
then returns structured gap/risk/recommendation insights.
"""
from __future__ import annotations

import json
import uuid

import anthropic
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.architecture_tools import ARCHITECTURE_TOOLS, execute_tool
from app.ai.prompts import INSIGHTS_SYSTEM
from app.config import settings
from app.models.insights import AiInsight
from app.services.architecture_gaps import compute_architecture_gaps

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

MAX_TOOL_ROUNDS = 8


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
    if not settings.anthropic_api_key:
        return await compute_architecture_gaps(db, workspace_id, org_id)

    messages: list[dict] = [
        {
            "role": "user",
            "content": (
                "Analyse this workspace architecture. Use the available tools to query domains, "
                "capabilities, systems, products, roadmap items, and relationships. "
                "Start with get_architecture_gaps and get_workspace_summary, then drill into "
                "anything surprising. When done, output ONLY the final JSON insights object — "
                "no markdown fences."
            ),
        }
    ]

    for _ in range(MAX_TOOL_ROUNDS):
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=INSIGHTS_SYSTEM,
            tools=ARCHITECTURE_TOOLS,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            for block in response.content:
                if block.type == "text":
                    insights = _parse_insights_json(block.text)
                    if insights:
                        return insights
            break

        if response.stop_reason != "tool_use":
            break

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            result = await execute_tool(
                block.name,
                block.input if isinstance(block.input, dict) else {},
                db,
                workspace_id,
                org_id,
            )
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str),
                }
            )

        if not tool_results:
            break
        messages.append({"role": "user", "content": tool_results})

    return await compute_architecture_gaps(db, workspace_id, org_id)


async def generate_insights(
    workspace_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> list[AiInsight]:
    """Generate AI insights for a workspace and persist them."""
    await db.execute(
        delete(AiInsight).where(
            AiInsight.workspace_id == workspace_id,
            AiInsight.org_id == org_id,
        )
    )

    raw_insights = await _run_insights_agent(db, workspace_id, org_id)

    insights: list[AiInsight] = []
    for item in raw_insights[:15]:
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
