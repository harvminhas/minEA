"""
AI Insights background job.
Builds a workspace context snapshot → single Claude call → JSON insights → stored as AiInsight records.
"""
import json
import uuid

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts import INSIGHTS_SYSTEM
from app.config import settings
from app.models.insights import AiInsight

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def generate_insights(workspace_context: dict, workspace_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> list[AiInsight]:
    """Generate AI insights for a workspace and persist them."""
    context_json = json.dumps(workspace_context, indent=2)

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=INSIGHTS_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": f"Analyse this architecture model and return insights:\n\n```json\n{context_json}\n```",
            }
        ],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    insights: list[AiInsight] = []
    for item in data.get("insights", []):
        insight = AiInsight(
            workspace_id=workspace_id,
            org_id=org_id,
            type=item.get("type", "recommendation"),
            title=item.get("title", ""),
            description=item.get("description", ""),
            severity=item.get("severity"),
            affected_object_ids=item.get("affected_object_ids", []),
            raw_response=item,
        )
        db.add(insight)
        insights.append(insight)

    await db.commit()
    return insights
