"""Tolerant JSON-object parsing: fences, prose around the object, trailing commas, smart quotes."""
from __future__ import annotations

import json
import re

_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.S | re.I)
_SMART = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})


def _outer_object(text: str) -> str | None:
    start = text.find("{")
    while start != -1:
        depth = 0
        in_str = False
        escape = False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        start = text.find("{", start + 1)
    return None


def _repair(text: str) -> str:
    return re.sub(r",\s*([}\]])", r"\1", text.translate(_SMART))


def _loads(text: str) -> dict | None:
    try:
        value = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def parse_json_object(text: str) -> dict | None:
    text = (text or "").strip()
    if not text:
        return None
    candidates = [text]
    candidates += [m.group(1).strip() for m in _FENCE.finditer(text)]
    candidates.append(re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I))
    for candidate in list(candidates):
        outer = _outer_object(candidate)
        if outer:
            candidates.append(outer)
    for candidate in candidates:
        parsed = _loads(candidate)
        if parsed is not None:
            return parsed
    for candidate in candidates:
        repaired = _repair(candidate)
        parsed = _loads(repaired) or (_loads(_outer_object(repaired) or "") if "{" in repaired else None)
        if parsed is not None:
            return parsed
    return None
