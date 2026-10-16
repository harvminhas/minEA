"""Which numbers an Ask answer may state.

A number is grounded when it is in a lookup result or follows directly from one: a value, the
length of a returned list, the sum of a list of values, a count per kind, a share (percentage)
of two such numbers, a rounding of a cost ("$1.2M", "120k"), or a number in the question, a
returned name ("Microsoft 365") or a date. Small numbers (0-10) and years are always allowed:
they are ordinals, list positions and dates, not claims about the estate.
"""

from __future__ import annotations

import re
from collections import Counter

NUMBER_TOKEN = re.compile(r"\$?\d[\d,]*(?:\.\d+)?\s?(?:%|[kKmM]\b)?")


def normalize(token: str) -> str:
    return token.replace("$", "").replace(",", "").replace("%", "").strip()


def _add(out: set[str], value: float) -> None:
    if value != value or value in (float("inf"), float("-inf")):
        return
    whole = round(value)
    if abs(value - whole) < 1e-9:
        out.add(str(int(whole)))
    else:
        out.add(f"{value:g}")
        out.add(f"{value:.2f}".rstrip("0").rstrip("."))
        out.add(str(int(whole)))


def harvest(value: object, out: set[str]) -> None:
    """Every number in a tool result, plus list lengths and the sum of numeric lists."""
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        _add(out, float(value))
    elif isinstance(value, str):
        for token in re.findall(r"\d+(?:\.\d+)?", value):
            _add(out, float(token))
    elif isinstance(value, dict):
        numeric = [v for v in value.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
        if len(numeric) > 1:
            _add(out, float(sum(numeric)))  # e.g. by_type {"Application": 7, "Server": 3} -> 10
        for item in value.values():
            harvest(item, out)
    elif isinstance(value, (list, tuple)):
        _add(out, float(len(value)))
        for item in value:
            harvest(item, out)
        # Sums of each numeric field across the rows (a total cost of the listed items).
        if value and all(isinstance(item, dict) for item in value):
            keys = set().union(*(item.keys() for item in value))
            for key in keys:
                nums = [item[key] for item in value if isinstance(item.get(key), (int, float)) and not isinstance(item.get(key), bool)]
                if nums:
                    _add(out, float(sum(nums)))
            for key in keys:
                labels = [item.get(key) for item in value if isinstance(item.get(key), str)]
                if labels and len(set(labels)) < len(labels):
                    for n in Counter(labels).values():  # rows per kind / vendor / owner
                        _add(out, float(n))


def graph_numbers(graph, out: set[str]) -> None:
    """The counts the "Read your estate" step shows: total and per type."""
    records = [rec for rec in getattr(graph, "records", {}).values() if getattr(rec, "type", None) in {"application", "infrastructure"}]
    _add(out, float(len(records)))
    for counter in (Counter(rec.type for rec in records), Counter(rec.type_label() for rec in records)):
        for n in counter.values():
            _add(out, float(n))


def _as_float(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None


def is_grounded(token: str, allowed: set[str]) -> bool:
    raw = token.strip()
    percent = raw.endswith("%")
    suffix = raw[-1].lower() if raw[-1:] in "kKmM" else ""
    core = normalize(raw.rstrip("kKmM").strip())
    if core in allowed:
        return True
    value = _as_float(core)
    if value is None:
        return False
    if not suffix and not percent and (0 <= value <= 10 and value.is_integer()):
        return True
    if not suffix and not percent and value.is_integer() and 1990 <= value <= 2100:
        return True
    nums = [n for n in (_as_float(a) for a in allowed) if n is not None]
    if suffix:
        scale = 1_000 if suffix == "k" else 1_000_000
        return any(abs(n / scale - value) <= 0.051 * max(1.0, value) for n in nums if n >= scale / 10)
    if percent:
        ints = sorted({n for n in nums if n >= 0})[:400]
        for part in ints:
            for whole in ints:
                if whole > 0 and part <= whole and abs(100 * part / whole - value) < 1:
                    return True
        return False
    # A rounding of a lookup value ("about 12,400" for 12,385; "1.5" for 1.48).
    return not value.is_integer() and any(abs(n - value) < 0.05 for n in nums)


def ungrounded(body: str, allowed: set[str]) -> list[str]:
    return [token.strip() for token in NUMBER_TOKEN.findall(body) if not is_grounded(token, allowed)]
