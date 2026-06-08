"""Repository layer definitions for workspace copy preview and cloning."""

from __future__ import annotations

WORKSPACE_COPY_LAYERS: list[dict[str, str]] = [
    {"id": "strategy", "label": "Strategy", "subtitle": "Products, Roadmaps"},
    {"id": "business", "label": "Business", "subtitle": "Capabilities, Processes"},
    {"id": "application", "label": "Application", "subtitle": "Systems, Components"},
    {"id": "integration", "label": "Integration", "subtitle": "APIs, Events"},
    {"id": "data", "label": "Data", "subtitle": "Entities, Stores, Domains"},
    {"id": "technology", "label": "Technology", "subtitle": "Platforms, Runtimes, Integration Infra"},
    {"id": "people", "label": "People", "subtitle": "Roles, Teams"},
]

# Object types copied per layer (deduped when multiple layers selected).
LAYER_OBJECT_TYPES: dict[str, list[str]] = {
    "strategy": ["roadmap_item"],
    "business": ["business_domain", "capability", "value_stream"],
    "application": ["application", "solution", "technical_capability", "component", "agent"],
    "integration": ["api", "event", "integration_flow", "message_broker"],
    "data": ["data_object", "data_store", "data_domain"],
    "technology": ["cloud_service", "model", "tool", "message_broker"],
    "people": [],
}

# Copy order respects FKs in properties (domains before capabilities, etc.).
OBJECT_COPY_ORDER: list[str] = [
    "business_domain",
    "capability",
    "value_stream",
    "data_domain",
    "data_object",
    "data_store",
    "application",
    "solution",
    "technical_capability",
    "component",
    "agent",
    "cloud_service",
    "model",
    "tool",
    "message_broker",
    "api",
    "event",
    "integration_flow",
    "roadmap_item",
]

VALID_LAYER_IDS = {layer["id"] for layer in WORKSPACE_COPY_LAYERS}


def object_types_for_layers(layer_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for layer_id in layer_ids:
        for obj_type in LAYER_OBJECT_TYPES.get(layer_id, []):
            if obj_type not in seen:
                seen.add(obj_type)
                ordered.append(obj_type)
    return [t for t in OBJECT_COPY_ORDER if t in seen]
