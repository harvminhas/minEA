"""Human-readable labels for object change_log entries."""
from __future__ import annotations

from typing import Any

from app.models.objects import ChangeLog

PROPERTY_LABELS: dict[str, str] = {
    "ai_role": "AI role",
    "hosting_model": "Hosting model",
    "annual_cost": "Annual cost",
    "eu_ai_act_risk_class": "EU AI Act risk class",
    "autonomy_level": "Autonomy level",
    "is_custom_built": "Custom-built",
    "category_legacy": "Previous category",
    "category_review_required": "Category review",
    "graph_layout": "Diagram layout",
    "mechanism": "Mechanism",
    "direction": "Direction",
    "protocol": "Protocol",
    "frequency": "Frequency",
    "delivery": "Delivery",
    "topic": "Topic",
    "schema_version": "Schema version",
    "auth": "Authentication",
    "audience": "Audience",
    "criticality": "Criticality",
    "lifecycle": "Lifecycle",
    "classification": "Classification",
    "engine": "Engine",
    "provider": "Provider",
    "region": "Region",
    "pattern": "Pattern",
    "maturity": "Maturity",
    "investment": "Investment",
    "domain_id": "Domain",
    "data_domain_id": "Data domain",
    "order_index": "Order",
    "broker": "Event broker",
    "carrier": "Integration carrier",
    "platform": "Platform",
    "vendor": "Vendor",
    "category": "Category",
}

OBJECT_TYPE_NOUN: dict[str, str] = {
    "application": "system",
    "solution": "system",
    "technical_capability": "system",
    "integration_flow": "flow",
    "event": "event",
    "api": "API",
    "component": "component",
    "data_object": "data object",
    "data_store": "data store",
    "data_domain": "data domain",
    "capability": "capability",
    "message_broker": "message broker",
    "cloud_service": "cloud service",
    "tool": "tool",
    "model": "model",
    "tech_debt": "tech debt item",
}


def _property_label(key: str) -> str:
    return PROPERTY_LABELS.get(key, key.replace("_", " "))


def _object_noun(object_type: str | None) -> str:
    if not object_type:
        return "object"
    return OBJECT_TYPE_NOUN.get(object_type, object_type.replace("_", " "))


def _format_property_value(key: str, value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (int, float)):
        if key == "annual_cost":
            return f"${value:,.0f}"
        return str(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if "_" in stripped and key not in ("topic", "name", "description"):
            return stripped.replace("_", " ").title()
        return stripped
    if isinstance(value, dict):
        for sub in ("platform_name", "carrier_name", "broker_name", "name", "topic", "label"):
            nested = value.get(sub)
            if nested:
                return str(nested).strip() or None
        return None
    if isinstance(value, list):
        if not value:
            return None
        return f"{len(value)} item{'s' if len(value) != 1 else ''}"
    return str(value)


def _diff_property_keys(
    old: dict | None,
    new: dict | None,
) -> list[tuple[str, str | None, str | None]]:
    old_props = old or {}
    new_props = new or {}
    keys = set(old_props.keys()) | set(new_props.keys())
    changes: list[tuple[str, str | None, str | None]] = []
    for key in sorted(keys):
        old_val = old_props.get(key)
        new_val = new_props.get(key)
        if old_val == new_val:
            continue
        changes.append(
            (
                key,
                _format_property_value(key, old_val),
                _format_property_value(key, new_val),
            )
        )
    return changes


def _describe_single_property_change(
    key: str,
    old_disp: str | None,
    new_disp: str | None,
) -> tuple[str, str | None]:
    label = _property_label(key)
    if old_disp is None and new_disp is not None:
        return f"set {label}", new_disp
    if old_disp is not None and new_disp is None:
        return f"cleared {label}", old_disp
    if old_disp and new_disp:
        return f"updated {label}", f"{old_disp} → {new_disp}"
    return f"updated {label}", None


def _describe_property_changes(prop_change: dict[str, Any]) -> tuple[str, str | None]:
    diffs = _diff_property_keys(prop_change.get("old"), prop_change.get("new"))
    if not diffs:
        return "updated properties", None
    if len(diffs) == 1:
        key, old_disp, new_disp = diffs[0]
        return _describe_single_property_change(key, old_disp, new_disp)

    labels = [_property_label(key) for key, _, _ in diffs]
    action = f"updated {', '.join(labels)}"

    if len(diffs) <= 4:
        detail_parts: list[str] = []
        for key, old_disp, new_disp in diffs:
            label = _property_label(key)
            if old_disp and new_disp:
                detail_parts.append(f"{label}: {old_disp} → {new_disp}")
            elif new_disp:
                detail_parts.append(f"{label}: {new_disp}")
            elif old_disp:
                detail_parts.append(f"{label}: cleared ({old_disp})")
            else:
                detail_parts.append(label)
        return action, "; ".join(detail_parts)

    return action, f"{len(diffs)} fields changed"


def _describe_field_changes(changes: dict[str, Any]) -> tuple[str, str | None]:
    if not changes:
        return "updated object", None

    if list(changes.keys()) == ["status"]:
        old = changes["status"].get("old") or "—"
        new = changes["status"].get("new") or "—"
        return "updated status", f"{old} → {new}"

    if list(changes.keys()) == ["owner"]:
        old = changes["owner"].get("old") or "Unassigned"
        new = changes["owner"].get("new") or "Unassigned"
        return "updated owner", f"{old} → {new}"

    if list(changes.keys()) == ["name"]:
        old = changes["name"].get("old")
        new = changes["name"].get("new")
        if old and new and old != new:
            return "renamed", f"{old} → {new}"
        return "renamed", new

    if list(changes.keys()) == ["description"]:
        return "updated description", None

    if list(changes.keys()) == ["tags"]:
        return "updated tags", None

    if list(changes.keys()) == ["properties"]:
        return _describe_property_changes(changes["properties"])

    if "properties" in changes:
        prop_action, prop_detail = _describe_property_changes(changes["properties"])
        other_keys = [k for k in changes if k != "properties"]
        other_labels = ", ".join(k.replace("_", " ") for k in other_keys)
        if other_labels:
            return f"{prop_action} and {other_labels}", prop_detail
        return prop_action, prop_detail

    labels = ", ".join(k.replace("_", " ") for k in changes)
    return f"updated {labels}", None


def describe_object_history(entry: ChangeLog) -> tuple[str, str | None]:
    diff = entry.diff or {}
    action_type = diff.get("action_type")
    noun = _object_noun(entry.object_type)

    if entry.action == "created" or action_type == "created_object":
        return f"created this {noun}", None

    if entry.action == "deleted" or action_type == "deleted_object":
        return f"deleted this {noun}", None

    if action_type == "updated_fields":
        return _describe_field_changes(diff.get("changes", {}))

    # Legacy flat diffs from before structured logging
    if entry.action == "updated":
        parts: list[str] = []
        for key, val in diff.items():
            if key in ("action_type", "changes"):
                continue
            if key == "status":
                return "updated status", str(val)
            if key == "owner":
                return "updated owner", str(val)
            if key == "name":
                return "renamed", str(val)
            if key == "properties" and isinstance(val, dict):
                return _describe_property_changes(val)
            parts.append(key.replace("_", " "))
        if parts:
            return f"updated {', '.join(parts)}", None

    return entry.action.replace("_", " "), None
