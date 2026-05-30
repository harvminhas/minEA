"""
CIS ingestion pipeline:
  Input (text / extracted doc content)
  → Claude (CIS v1.1 JSON extraction)
  → Pydantic validation
  → Return proposed objects + relationships for review UI
"""
import json

import anthropic
from pydantic import BaseModel, ValidationError

from app.ai.prompts import CIS_EXTRACTION_SYSTEM
from app.config import settings
from app.schemas.relationships import ALLOWED_TRIPLES

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


class ProposedObject(BaseModel):
    local_id: str
    type: str
    name: str
    description: str | None = None
    properties: dict = {}


class ProposedRelationship(BaseModel):
    local_id: str
    type: str
    from_local_id: str
    to_local_id: str
    attributes: dict = {}


class CisPayload(BaseModel):
    objects: list[ProposedObject]
    relationships: list[ProposedRelationship]


VALID_TYPES = {
    "capability", "value_stream", "application", "solution", "technical_capability", "component",
    "agent", "data_object", "data_store", "api", "event", "integration_flow",
    "message_broker", "tool", "cloud_service", "model", "tech_debt", "roadmap_item",
}


async def extract_from_text(text: str) -> CisPayload:
    """Run Claude CIS extraction and validate the output."""
    response = await client.messages.create(
        model="claude-haiku-4-5",  # Faster + cheaper for classification
        max_tokens=8192,
        system=CIS_EXTRACTION_SYSTEM,
        messages=[{"role": "user", "content": f"Extract architecture objects from:\n\n{text}"}],
    )

    raw = response.content[0].text.strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude returned invalid JSON: {e}\n\nRaw: {raw[:500]}")

    try:
        payload = CisPayload.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"CIS payload validation failed: {e}")

    # Filter out invalid types
    payload.objects = [o for o in payload.objects if o.type in VALID_TYPES]

    # Filter out invalid relationship triples
    local_id_to_type = {o.local_id: o.type for o in payload.objects}
    valid_rels = []
    for rel in payload.relationships:
        from_type = local_id_to_type.get(rel.from_local_id, "")
        to_type = local_id_to_type.get(rel.to_local_id, "")
        if (rel.type, from_type, to_type) in ALLOWED_TRIPLES:
            valid_rels.append(rel)
    payload.relationships = valid_rels

    return payload
