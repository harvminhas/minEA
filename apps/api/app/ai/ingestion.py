"""
CIS ingestion pipeline:
  Input (text / extracted doc content)
  → Gemini Flash (CIS v1.1 JSON extraction)
  → Pydantic validation
  → Return proposed objects + relationships for review UI
"""
import json

from google.genai import types
from pydantic import BaseModel, ValidationError

from app.ai.gemini_client import format_api_error, get_client, is_configured, model_name, not_configured_message
from app.ai.prompts import CIS_EXTRACTION_SYSTEM
from app.schemas.relationships import ALLOWED_TRIPLES


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
    """Run Gemini CIS extraction and validate the output."""
    if not is_configured():
        raise ValueError(not_configured_message())

    try:
        response = await get_client().aio.models.generate_content(
            model=model_name(),
            contents=f"Extract architecture objects from:\n\n{text}",
            config=types.GenerateContentConfig(
                system_instruction=CIS_EXTRACTION_SYSTEM,
                max_output_tokens=8192,
            ),
        )
    except Exception as exc:
        raise ValueError(format_api_error(exc)) from exc

    raw = (response.text or "").strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned invalid JSON: {e}\n\nRaw: {raw[:500]}") from e

    try:
        payload = CisPayload.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"CIS payload validation failed: {e}") from e

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
