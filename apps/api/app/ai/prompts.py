from app.schemas.relationships import ALLOWED_TRIPLES

SYSTEM_PROMPT_BASE = """You are an Enterprise Architecture assistant for BuboMap.

minEA is an architecture modelling tool. Users describe their organisation's architecture —
business capabilities, software applications, data, integrations, and infrastructure —
and minEA stores a structured, queryable model of it.

You have access to the user's complete architecture model below. Use it to answer questions,
identify gaps and risks, and suggest improvements.

Key rules:
- Every element in minEA is a real object with properties and relationships — not a shape on a diagram.
- An AI feature (such as Copilot in Microsoft 365) is a setting on an app, not a separate record. AI agents and AI models are records.
- Layers: Business → Application → Data → Integration → Infrastructure.
- Relationships flow within-layer or downward only.
- Be concise and specific. Reference object names from the model directly.
- If asked about something not in the model, say so explicitly.
"""

_CIS_TEMPLATE = """You are an Enterprise Architecture data extractor for minEA.

Extract all architecture objects and relationships from the provided text/document and output
them as CIS v1.1 JSON. CIS (Common Information Schema) is minEA's standard import format.

Valid object types:
  Strategy Layer: capability, value_stream, roadmap_item
  Application Layer: application, solution, technical_capability, agent, ai_model
  Data Layer: data_object, data_store
  Integration Layer: api, event, integration_flow, message_broker, tool
  Infrastructure Layer: cloud_service, model, location, external_party
  Risk Layer: tech_debt

  agent = an AI agent or bot the company built or runs (it reads from and writes to systems, and can call tools or other agents).
  ai_model = an AI model an agent uses, such as GPT-4o or Claude.
  An AI feature (Copilot in Microsoft 365, Zoom AI Companion, Shopify Sidekick) is a setting on an app, not a separate record. Do not output it as an object.

Valid relationship types and allowed triples:
{RELATIONSHIPS}
Output ONLY valid JSON in this exact schema:
{
  "objects": [
    {
      "local_id": "app-1",
      "type": "application",
      "name": "Salesforce",
      "description": "CRM platform",
      "properties": { "vendor": "Salesforce", "category": "CRM" }
    }
  ],
  "relationships": [
    {
      "local_id": "rel-1",
      "type": "supported_by",
      "from_local_id": "cap-1",
      "to_local_id": "app-1",
      "attributes": { "strength": "primary" }
    }
  ]
}

Local ID prefixes: cap-, vs-, app-, sol-, tc-, agt-, dat-, ds-, api-, evt-, if-, mb-, tol-, cs-, mdl-, rel-

Extract every architecture element mentioned. Do not invent elements not mentioned in the source.
Output ONLY the JSON object — no explanation, no markdown fences.
"""


# Object types the extraction prompt lists. Triples are generated from ALLOWED_TRIPLES so the
# prompt can't drift from what the API accepts (tests/test_prompts.py).
CIS_OBJECT_TYPES = (
    "capability", "value_stream", "roadmap_item",
    "application", "solution", "technical_capability", "agent", "ai_model",
    "data_object", "data_store",
    "api", "event", "integration_flow", "message_broker", "tool",
    "cloud_service", "model", "location", "external_party",
    "tech_debt",
)

# Order of the relationship lines (types not listed follow alphabetically).
_REL_ORDER = (
    "depends_on", "supported_by", "part_of", "calls", "uses", "exposes", "publishes", "consumes", "subscribes",
    "reads", "writes", "owns", "creates", "updates", "belongs_to", "contains", "connects", "routes", "hosts",
    "carries", "runs_on", "located_at", "supplied_by", "sends_data_to", "built_on", "uses_model", "can_call",
    "supports", "escalates_to", "accesses", "connects_to", "affects", "resolves", "replaces",
    "authenticates_via",
)

# (type, target) → note. (type, None) applies to every target of that type.
_NOTES: dict[tuple[str, str | None], str] = {
    ("owns", "data_store"): "primary custodian; only one system per store",
    ("owns", "data_object"): "system of record; only one system per entity",
    ("creates", "data_object"): "originates records for this entity",
    ("updates", "data_object"): "modifies existing entity records",
    ("reads", "data_object"): "consumes without modifying",
    ("runs_on", "model"): "model is a server or device, not an AI model",
    ("sends_data_to", None): "data movement; does not change impact",
    ("built_on", None): "the platform or tool it is built with",
    ("uses_model", None): "the AI model an agent uses",
    ("can_call", None): "an agent calling a tool or another agent",
    ("authenticates_via", None): "the app or platform people sign in through (single sign-on)",
}


def relationship_lines(triples: set[tuple[str, str, str]] = ALLOWED_TRIPLES) -> str:
    """One line per (type, sources, targets, note), generated from the allowed triples."""
    allowed = set(CIS_OBJECT_TYPES)
    sources_by: dict[tuple[str, str, str], set[str]] = {}
    for rel, source, target in triples:
        if source not in allowed or target not in allowed:
            continue
        note = _NOTES.get((rel, target)) or _NOTES.get((rel, None)) or ""
        sources_by.setdefault((rel, target, note), set()).add(source)
    merged: dict[tuple[str, tuple[str, ...], str], list[str]] = {}
    for (rel, target, note), sources in sources_by.items():
        merged.setdefault((rel, tuple(sorted(sources, key=CIS_OBJECT_TYPES.index)), note), []).append(target)
    rank = {rel: index for index, rel in enumerate(_REL_ORDER)}
    lines = []
    for (rel, sources, note), targets in sorted(
        merged.items(),
        key=lambda item: (rank.get(item[0][0], len(rank)), item[0][0], min(CIS_OBJECT_TYPES.index(t) for t in item[1])),
    ):
        ordered = sorted(targets, key=CIS_OBJECT_TYPES.index)
        suffix = f" ({note})" if note else ""
        lines.append(f"  {rel}: {' | '.join(sources)} → {' | '.join(ordered)}{suffix}")
    return "\n".join(lines)


CIS_EXTRACTION_SYSTEM = _CIS_TEMPLATE.replace("{RELATIONSHIPS}", relationship_lines())


INSIGHTS_SYSTEM = """You are an Enterprise Architecture analyst for BuboMap.

You analyse workspace architecture models by calling query tools — never guess from memory.
Available tools let you fetch domains, capabilities, systems, products, roadmap items,
relationships, and pre-computed gaps.

Workflow:
1. Call get_workspace_summary and get_architecture_gaps first.
2. Drill into specific areas with other tools if needed (e.g. capabilities without systems).
3. Identify the top gaps, risks, and recommendations — focus on completeness and risk.
4. When finished querying, respond with ONLY valid JSON (no markdown fences):

{
  "insights": [
    {
      "type": "gap",
      "title": "3 domains have no capabilities",
      "examples": ["Finance", "Legal", "HR"],
      "impact_note": "The capability heatmap will be incomplete until these are defined.",
      "severity": "high",
      "affected_object_ids": []
    }
  ]
}

Field rules:
- type: gap | risk | recommendation
- severity: high (critical) | medium (warning) | low (info)
- examples: up to 5 entity names illustrating the issue
- impact_note: one sentence on why this matters for views/reporting
- title: concise count + issue (match wireframe style)
- Limit to the 10 most impactful insights. Prefer gaps from get_architecture_gaps; add risks only when supported by tool data.
"""
