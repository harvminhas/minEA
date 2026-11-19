"""Assessment score shapes, validation, and derivation.

Functional scores live on supported_by.attributes.functional_assessment.
Non-functional scores live on application / cloud_service properties.nonfunctional_assessment.
Evidence is notes and links only (no files, no new table).

Descriptors: app/data/assessment-descriptors.json, a byte-for-byte copy of
packages/types/src/assessment-descriptors.json. tests/test_assessment_descriptors.py
keeps the two in step.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "assessment-descriptors.json"
DESCRIPTORS = json.loads(DATA_PATH.read_text(encoding="utf-8"))

FUNCTIONAL_DIMENSIONS = (
    "coverage",
    "effectiveness",
    "user_sentiment",
    "automation",
    "data_reporting",
    "regional_fit",
)
NONFUNCTIONAL_DIMENSIONS = (
    "resilience",
    "performance_usability",
    "security",
    "integration",
    "maintainability",
    "vendor_lifecycle",
    "cost",
    "strategic_fit",
)
CONFIDENCES = ("H", "M", "L")
REGIONAL_SCOPES = ("us", "canada", "both")
EVIDENCE_KINDS = ("note", "link")
NF_APP_TYPES = {"application", "cloud_service"}

TEXT_MAX = 4000
GAP_MAX = 2000
GAP_LIMIT = 50
EVIDENCE_LIMIT = 20
URL_MAX = 2000

_SCOPE_ALIASES = {
    "united states": "us",
    "usa": "us",
    "u.s.": "us",
    "u.s": "us",
    "ca": "canada",
}


def parse_score(raw: Any) -> int | None:
    try:
        number = int(raw)
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 5 else None


def parse_confidence(raw: Any) -> str | None:
    value = str(raw or "").strip().upper()
    return value if value in CONFIDENCES else None


def parse_regional_scope(raw: Any) -> str | None:
    value = str(raw or "").strip().lower().replace("_", "-")
    value = _SCOPE_ALIASES.get(value, value)
    return value if value in REGIONAL_SCOPES else None


def coverage_score_from_percent(percent: float) -> int:
    bands = DESCRIPTORS["functional"]["coverage"].get("coverage_bands") or []
    clamped = max(0, min(100, percent))
    for band in bands:
        if band["min"] <= clamped <= band["max"]:
            return int(band["score"])
    return 1


def compute_coverage(supported: int, total: int) -> dict | None:
    if total <= 0:
        return None
    safe = max(0, min(total, int(supported)))
    percent = round(100 * safe / total)
    return {"supported": safe, "total": total, "percent": percent, "score": coverage_score_from_percent(percent)}


def weakest_score(values: list[int | None] | tuple[int | None, ...]) -> int | None:
    scored = [value for value in values if isinstance(value, int) and 1 <= value <= 5]
    return min(scored) if scored else None


def fitness_from_scores(values: list[int | None] | tuple[int | None, ...]) -> str | None:
    weakest = weakest_score(values)
    if weakest is None:
        return None
    if weakest <= 2:
        return "weak"
    if weakest == 3:
        return "adequate"
    return "strong"


def _plain(value: Any) -> bool:
    return isinstance(value, dict)


def parse_dimension_score(raw: Any) -> dict | None:
    if not _plain(raw):
        return None
    score = parse_score(raw.get("score"))
    if score is None:
        return None
    confidence = parse_confidence(raw.get("confidence")) or "M"
    return {"score": score, "confidence": confidence, "evidence": _parse_evidence(raw.get("evidence"))}


def _scores_source(raw: dict, meta_keys: set[str]) -> dict:
    if _plain(raw.get("scores")):
        return raw["scores"]
    return {key: value for key, value in raw.items() if key not in meta_keys}


def parse_functional_assessment(raw: Any) -> dict | None:
    if raw is None or raw == "":
        return None
    if not _plain(raw):
        return None
    source = _scores_source(raw, {"scores", "gaps", "regional_scope", "coverage_computed"})
    scores = {}
    for key in FUNCTIONAL_DIMENSIONS:
        parsed = parse_dimension_score(source.get(key))
        if parsed:
            scores[key] = parsed
    gaps = _parse_gaps(raw.get("gaps"))
    scope = parse_regional_scope(raw.get("regional_scope"))
    if not scores and not gaps and not scope:
        if "scores" in raw or "gaps" in raw or "regional_scope" in raw:
            return {"scores": scores, "gaps": gaps, "regional_scope": scope}
        return None
    return {"scores": scores, "gaps": gaps, "regional_scope": scope}


def parse_nonfunctional_assessment(raw: Any) -> dict | None:
    if raw is None or raw == "":
        return None
    if not _plain(raw):
        return None
    source = _scores_source(raw, {"scores"})
    scores = {}
    for key in NONFUNCTIONAL_DIMENSIONS:
        parsed = parse_dimension_score(source.get(key))
        if parsed:
            scores[key] = parsed
    if not scores:
        return {"scores": scores} if "scores" in raw else None
    return {"scores": scores}


def dimension_scores_of(assessment: dict | None) -> list[int]:
    if not assessment:
        return []
    values = []
    for item in (assessment.get("scores") or {}).values():
        if isinstance(item, dict) and parse_score(item.get("score")):
            values.append(int(item["score"]))
    return values


def display_fitness(attributes: dict | None, extra_scores: list[int | None] | None = None) -> str | None:
    assessment = parse_functional_assessment((attributes or {}).get("functional_assessment"))
    derived = fitness_from_scores([*dimension_scores_of(assessment), *(extra_scores or [])])
    if derived:
        return derived
    raw = str((attributes or {}).get("fitness") or "").strip().lower()
    return raw if raw in {"strong", "adequate", "weak"} else None


def serialize_functional_assessment(assessment: dict) -> dict:
    scores = {}
    for key in FUNCTIONAL_DIMENSIONS:
        item = (assessment.get("scores") or {}).get(key)
        if item:
            scores[key] = _serialize_score(item)
    blob: dict[str, Any] = {"scores": scores}
    if assessment.get("gaps"):
        blob["gaps"] = list(assessment["gaps"])
    if assessment.get("regional_scope"):
        blob["regional_scope"] = assessment["regional_scope"]
    return blob


def serialize_nonfunctional_assessment(assessment: dict) -> dict:
    scores = {}
    for key in NONFUNCTIONAL_DIMENSIONS:
        item = (assessment.get("scores") or {}).get(key)
        if item:
            scores[key] = _serialize_score(item)
    return {"scores": scores}


def _serialize_score(item: dict) -> dict:
    blob: dict[str, Any] = {"score": item["score"], "confidence": item["confidence"]}
    if item.get("evidence"):
        blob["evidence"] = [dict(entry) for entry in item["evidence"]]
    return blob


def validate_functional_assessment(raw: Any) -> dict | None:
    if raw is None:
        return None
    if not _plain(raw):
        raise ValueError("functional_assessment must be an object.")
    if raw.get("scores") is not None and not _plain(raw.get("scores")):
        raise ValueError("functional_assessment.scores must be an object.")
    source = raw["scores"] if _plain(raw.get("scores")) else _scores_source(raw, {"scores", "gaps", "regional_scope", "coverage_computed"})
    scores = {}
    for key, value in source.items():
        if key not in FUNCTIONAL_DIMENSIONS:
            raise ValueError(f"Unknown functional dimension '{key}'.")
        if value is None:
            continue
        scores[key] = _validate_dimension_score(key, value)
    gaps = [] if raw.get("gaps") is None else _validate_gaps(raw.get("gaps"))
    scope = None
    if raw.get("regional_scope") not in (None, ""):
        scope = parse_regional_scope(raw.get("regional_scope"))
        if not scope:
            raise ValueError("regional_scope must be us, canada, or both.")
    return {"scores": scores, "gaps": gaps, "regional_scope": scope}


def validate_nonfunctional_assessment(raw: Any) -> dict | None:
    if raw is None:
        return None
    if not _plain(raw):
        raise ValueError("nonfunctional_assessment must be an object.")
    if raw.get("scores") is not None and not _plain(raw.get("scores")):
        raise ValueError("nonfunctional_assessment.scores must be an object.")
    source = raw["scores"] if _plain(raw.get("scores")) else _scores_source(raw, {"scores"})
    scores = {}
    for key, value in source.items():
        if key not in NONFUNCTIONAL_DIMENSIONS:
            raise ValueError(f"Unknown non-functional dimension '{key}'.")
        if value is None:
            continue
        scores[key] = _validate_dimension_score(key, value)
    return {"scores": scores}


def _validate_dimension_score(label: str, raw: Any) -> dict:
    if not _plain(raw):
        raise ValueError(f"{label} must be an object with score, confidence, and evidence.")
    score = parse_score(raw.get("score"))
    if score is None:
        raise ValueError(f"{label}.score must be an integer from 1 to 5.")
    confidence = parse_confidence(raw.get("confidence"))
    if not confidence:
        raise ValueError(f"{label}.confidence must be H, M, or L.")
    return {"score": score, "confidence": confidence, "evidence": _validate_evidence_list(label, raw.get("evidence"))}


def _parse_gaps(raw: Any) -> list[str]:
    try:
        return [] if raw is None else _validate_gaps(raw)
    except ValueError:
        return []


def _validate_gaps(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        raise ValueError("gaps must be a list of text items.")
    if len(raw) > GAP_LIMIT:
        raise ValueError(f"gaps cannot have more than {GAP_LIMIT} items.")
    gaps = []
    for item in raw:
        if not isinstance(item, str):
            raise ValueError("Each gap must be text.")
        text = item.strip()
        if not text:
            continue
        if len(text) > GAP_MAX:
            raise ValueError(f"Each gap must be at most {GAP_MAX} characters.")
        gaps.append(text)
    return gaps


def _parse_evidence(raw: Any) -> list[dict]:
    try:
        return [] if raw is None else _validate_evidence_list("evidence", raw)
    except ValueError:
        return []


def _validate_evidence_list(label: str, raw: Any) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError(f"{label}.evidence must be a list.")
    if len(raw) > EVIDENCE_LIMIT:
        raise ValueError(f"{label}.evidence cannot have more than {EVIDENCE_LIMIT} items.")
    return [_validate_evidence(f"{label}.evidence[{index}]", item) for index, item in enumerate(raw)]


def _validate_evidence(label: str, raw: Any) -> dict:
    if not _plain(raw):
        raise ValueError(f"{label} must be an object.")
    kind = str(raw.get("kind") or "").strip().lower()
    if kind == "file":
        raise ValueError(f"{label}: file attachments are not supported; use a note or a link.")
    if kind not in EVIDENCE_KINDS:
        raise ValueError(f"{label}.kind must be note or link.")
    text = None if raw.get("text") is None else str(raw.get("text")).strip()
    url = None if raw.get("url") is None else str(raw.get("url")).strip()
    if text and len(text) > TEXT_MAX:
        raise ValueError(f"{label}.text must be at most {TEXT_MAX} characters.")
    if url and len(url) > URL_MAX:
        raise ValueError(f"{label}.url must be at most {URL_MAX} characters.")
    if kind == "note":
        if not text:
            raise ValueError(f"{label}: a note needs text.")
        item = {"kind": "note", "text": text}
        if url:
            item["url"] = url
        return item
    if not url or not _is_http_url(url):
        raise ValueError(f"{label}: a link needs an http(s) URL.")
    item = {"kind": "link", "url": url}
    if text:
        item["text"] = text
    return item


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def apply_functional_assessment(attributes: dict) -> dict:
    """Validate a functional_assessment blob if present and derive fitness when scores exist."""
    if "functional_assessment" not in attributes:
        return attributes
    raw = attributes.get("functional_assessment")
    if raw is None:
        attributes.pop("functional_assessment", None)
        return attributes
    parsed = validate_functional_assessment(raw)
    if parsed is None:
        attributes.pop("functional_assessment", None)
        return attributes
    attributes["functional_assessment"] = serialize_functional_assessment(parsed)
    derived = fitness_from_scores(dimension_scores_of(parsed))
    if derived:
        attributes["fitness"] = derived
    return attributes


def apply_nonfunctional_assessment(properties: dict) -> dict:
    """Validate a nonfunctional_assessment blob if present."""
    if "nonfunctional_assessment" not in properties:
        return properties
    raw = properties.get("nonfunctional_assessment")
    if raw is None:
        properties.pop("nonfunctional_assessment", None)
        return properties
    parsed = validate_nonfunctional_assessment(raw)
    if parsed is None:
        properties.pop("nonfunctional_assessment", None)
        return properties
    properties["nonfunctional_assessment"] = serialize_nonfunctional_assessment(parsed)
    return properties


def nf_scores_of(obj: dict | None) -> list[int]:
    if not obj or obj.get("type") not in NF_APP_TYPES:
        return []
    assessment = parse_nonfunctional_assessment((obj.get("properties") or {}).get("nonfunctional_assessment"))
    return dimension_scores_of(assessment)


def weakest_nf_under(capability_id: str, objects: list[dict], edges: list[dict], descendant_ids: set[str] | None = None) -> int | None:
    ids = descendant_ids if descendant_ids is not None else {capability_id}
    by_id = {obj["id"]: obj for obj in objects}
    values: list[int | None] = []
    seen: set[str] = set()
    for edge in edges:
        if edge.get("type") != "supported_by" or edge.get("from_object_id") not in ids:
            continue
        app_id = edge.get("to_object_id")
        if not app_id or app_id in seen:
            continue
        seen.add(app_id)
        values.extend(nf_scores_of(by_id.get(app_id)))
    return weakest_score(values)


def score_map(assessment: dict | None) -> dict[str, int]:
    if not assessment:
        return {}
    out: dict[str, int] = {}
    for key, item in (assessment.get("scores") or {}).items():
        if isinstance(item, dict) and parse_score(item.get("score")):
            out[key] = int(item["score"])
    return out
