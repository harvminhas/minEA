"""One vendor identity and plain labels for Ask (context, filters, chips). Data: app/data/ask_labels.json
(web copy: apps/web/lib/ask/ask-labels.json, parity-tested).

resolve_vendor turns any stored vendor value into (display vendor, product):
  form codes ("salesforce_mulesoft" -> ("Salesforce", "MuleSoft"), "microsoft" -> "Microsoft", "other" -> none),
  aliases ("sfdc" -> "Salesforce"), catalogue vendor names in their catalogue casing, else the text as typed
  (a snake_case leftover is humanized, never shown raw).
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

DATA = json.loads((Path(__file__).resolve().parents[2] / "data" / "ask_labels.json").read_text(encoding="utf-8"))
_CODE = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)+$")


def _key(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


@lru_cache(maxsize=1)
def _catalogue_vendor_names() -> dict[str, str]:
    """lower-case vendor name -> catalogue casing ("SALESFORCE" -> "Salesforce")."""
    path = Path(__file__).resolve().parents[2] / "data" / "tools.json"
    try:
        tools = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out: dict[str, str] = {}
    for tool in tools if isinstance(tools, list) else []:
        vendor = str(tool.get("vendor") or "").strip()
        if vendor:
            out.setdefault(_key(vendor), vendor)
    return out


def humanize(value: str) -> str:
    """A stored code as words: "etl_elt" -> "ETL / ELT" (known), "foo_bar" -> "Foo bar"."""
    text = str(value or "").strip()
    if not text:
        return ""
    known = DATA["codes"].get(text) or DATA["hosting"].get(text)
    if known:
        return known
    if _CODE.match(text):
        words = text.replace("_", " ")
        return words[:1].upper() + words[1:]
    return text


def hosting_label(value: str) -> str:
    text = str(value or "").strip()
    return DATA["hosting"].get(text) or humanize(text)


def resolve_vendor(raw: object) -> tuple[str | None, str | None]:
    text = str(raw or "").strip()
    if not text:
        return None, None
    key = _key(text)
    if key in DATA["vendor_codes"]:
        entry = DATA["vendor_codes"][key]
        return (entry["vendor"], entry.get("product")) if entry else (None, None)
    if key in DATA["not_vendor"]:
        return None, None
    if key in DATA["vendor_aliases"]:
        return DATA["vendor_aliases"][key], None
    named = _catalogue_vendor_names().get(key)
    if named:
        return named, None
    return humanize(text), None


def vendor_key(name: str) -> str:
    """Identity for exact matching: the resolved display name, folded."""
    resolved, _ = resolve_vendor(name)
    return re.sub(r"[^a-z0-9]", "", (resolved or "").lower())
