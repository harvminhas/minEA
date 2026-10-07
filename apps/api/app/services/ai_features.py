"""Validate properties.ai_features and properties.holds_data on apps and platforms."""

from __future__ import annotations

from fastapi import HTTPException, status

AI_FEATURE_TYPES = {"application", "solution", "technical_capability", "cloud_service"}
AI_KEYS = ("ai_features", "holds_data")
STATUSES = {"on", "off", "piloting", "unreviewed"}
YES_NO_UNKNOWN = {"yes", "no", "unknown"}
AUDIENCES = {"everyone", "some_groups", "admins"}
SOURCES = {"catalog", "user", "onboarding"}
HOLDS_DATA = {"customer", "financial", "employee", "none"}
DANGLING_COST_LINE = "That AI feature points at a cost line that isn't on this record."


def _fail(message: str) -> None:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def _text(value: object) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _validate_feature(item: object) -> dict:
    if not isinstance(item, dict):
        _fail("Each AI feature must be an object.")
    if not _text(item.get("key")) or not _text(item.get("name")):
        _fail("Each AI feature needs a key and a name.")
    if item.get("status") not in STATUSES:
        _fail("Pick on, off, piloting or not reviewed for the AI feature.")
    if item.get("sees_company_data") not in YES_NO_UNKNOWN or item.get("vendor_trains") not in YES_NO_UNKNOWN:
        _fail("Answer yes, no or not sure for the AI feature's data questions.")
    if item.get("audience") is not None and item.get("audience") not in AUDIENCES:
        _fail("Pick who can use the AI feature.")
    if item.get("source") is not None and item.get("source") not in SOURCES:
        _fail("Unknown AI feature source.")
    return item


def _validate_holds_data(raw: object) -> list[str]:
    if not isinstance(raw, list) or any(value not in HOLDS_DATA for value in raw):
        _fail("Holds data must be a list of customer, financial, employee or none.")
    values = list(dict.fromkeys(raw))
    if "none" in values and len(values) > 1:
        _fail("Holds data can't be none and something else.")
    return values


def strip_ai_keys(object_type: str, properties: dict) -> dict:
    """Type switch: a type that can't carry AI features drops them instead of failing."""
    if object_type not in AI_FEATURE_TYPES:
        for key in AI_KEYS:
            properties.pop(key, None)
    return properties


def apply_ai_features(object_type: str, properties: dict, *, strict: bool = True) -> dict:
    """Validate ai_features / holds_data in place. strict=False (a save that didn't send
    ai_features) clears a cost_line_id whose line was removed instead of failing."""
    for key in AI_KEYS:
        if key in properties and properties[key] is None:
            properties.pop(key)
    present = [key for key in AI_KEYS if key in properties]
    if not present:
        return properties
    if object_type not in AI_FEATURE_TYPES:
        _fail("AI features and held data only apply to applications and platforms.")

    if "holds_data" in properties:
        values = _validate_holds_data(properties["holds_data"])
        if values:
            properties["holds_data"] = values
        else:
            properties.pop("holds_data")

    if "ai_features" in properties:
        raw = properties["ai_features"]
        if not isinstance(raw, list):
            _fail("AI features must be a list.")
        features = [_validate_feature(item) for item in raw]
        keys = [feature["key"] for feature in features]
        if len(set(keys)) != len(keys):
            _fail("Each AI feature can only be listed once.")
        lines = properties.get("cost_lines")
        line_ids = {line.get("id") for line in lines if isinstance(line, dict)} if isinstance(lines, list) else set()
        for feature in features:
            line_id = feature.get("cost_line_id")
            if line_id is None or line_id in line_ids:
                continue
            if strict:
                _fail(DANGLING_COST_LINE)
            feature["cost_line_id"] = None
        if features:
            properties["ai_features"] = features
        else:
            properties.pop("ai_features")
    return properties
