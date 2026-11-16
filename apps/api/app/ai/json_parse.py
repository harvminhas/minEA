"""Tolerant JSON-object parsing: fences, prose around the object, trailing commas, smart quotes, truncated trees."""
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
        # Do not fall through to a later "{" — a truncated tree would otherwise
        # match a complete inner object (a capability) and drop the rest.
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


def parse_partial_json_object(text: str) -> dict | None:
    """Parse a JSON object, closing a truncated tree so complete domains/capabilities are kept."""
    parsed = parse_json_object(text)
    if parsed is not None:
        return parsed
    text = (text or "").strip()
    if not text:
        return None
    candidates = [text]
    candidates += [m.group(1).strip() for m in _FENCE.finditer(text)]
    for candidate in list(candidates):
        start = candidate.find("{")
        if start == -1:
            continue
        closed = _close_truncated_object(candidate[start:])
        if closed:
            candidates.append(closed)
            repaired = _repair(closed)
            if repaired != closed:
                candidates.append(repaired)
    for candidate in candidates:
        parsed = _loads(candidate)
        if parsed is not None:
            return parsed
    return None


def _close_truncated_object(text: str) -> str | None:
    prefix = _trim_dangling_opens(_safe_json_prefix(text))
    if not prefix:
        return None
    stack: list[str] = []
    in_str = False
    escape = False
    for ch in prefix:
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
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]" and stack:
            stack.pop()
    if in_str or escape:
        return None
    if prefix.endswith(":"):
        return None
    return prefix + "".join(reversed(stack))


def _trim_dangling_opens(text: str) -> str:
    """Drop trailing commas and empty incomplete objects like '{'. Keep empty arrays."""
    prefix = (text or "").rstrip()
    changed = True
    while prefix and changed:
        changed = False
        if prefix.endswith(","):
            prefix = prefix[:-1].rstrip()
            changed = True
            continue
        if prefix.endswith("{"):
            prefix = prefix[:-1].rstrip()
            if prefix.endswith(","):
                prefix = prefix[:-1].rstrip()
            changed = True
    return prefix


def _safe_json_prefix(text: str) -> str:
    """Cut truncated JSON so the prefix ends at a complete value (or an open container)."""
    stack: list[str] = []
    in_str = False
    escape = False
    string_start = -1
    last_good = 0
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if in_str:
            if escape:
                escape = False
                i += 1
                continue
            if ch == "\\":
                escape = True
                i += 1
                continue
            if ch == '"':
                in_str = False
            i += 1
            continue
        if ch.isspace():
            i += 1
            continue
        if ch == '"':
            in_str = True
            string_start = i
            i += 1
            continue
        if ch in "{[":
            stack.append(ch)
            last_good = i + 1
            i += 1
            continue
        if ch in "}]":
            if not stack:
                return text[: i + 1]
            opench = stack[-1]
            if (opench == "{" and ch != "}") or (opench == "[" and ch != "]"):
                return text[:last_good]
            stack.pop()
            last_good = i + 1
            i += 1
            if not stack:
                return text[:i]
            continue
        if ch == ",":
            last_good = i
            i += 1
            continue
        if ch == ":":
            i += 1
            continue
        if ch in "tfn":
            j = i
            while j < n and text[j].isalpha():
                j += 1
            if text[i:j] in {"true", "false", "null"}:
                last_good = j
                i = j
                continue
            return text[:last_good]
        if ch in "-0123456789":
            j = i + 1
            while j < n and text[j] in "0123456789.eE+-":
                j += 1
            try:
                json.loads(text[i:j])
            except (json.JSONDecodeError, ValueError):
                return text[:last_good]
            last_good = j
            i = j
            continue
        i += 1
    if in_str:
        return _drop_incomplete_member(text, string_start)
    return text[:last_good]


def _drop_incomplete_member(text: str, string_start: int) -> str:
    j = string_start
    while j > 0 and text[j - 1].isspace():
        j -= 1
    if j > 0 and text[j - 1] == ":":
        j -= 1
        while j > 0 and text[j - 1].isspace():
            j -= 1
        if j > 0 and text[j - 1] == '"':
            j -= 1
            while j > 0:
                if text[j - 1] == '"' and (j < 2 or text[j - 2] != "\\"):
                    j -= 1
                    break
                j -= 1
    while j > 0 and text[j - 1].isspace():
        j -= 1
    if j > 0 and text[j - 1] == ",":
        j -= 1
    return text[:j]
