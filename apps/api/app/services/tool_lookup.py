"""AI fallback for app names the catalogue doesn't know.

Returns, per typed name, {name, vendor, category, hosting, kind, confidence} or "unknown".
Never a cost. Cached per name (in-memory LRU, per process), rate-limited per org, with a hard
timeout: on any failure the names come back unknown and the card stays Custom.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from collections import OrderedDict, deque
from typing import Any, Awaitable, Callable

HOSTINGS = {"saas", "paas", "own", "either", "desktop"}
KINDS = {"app", "platform", "server"}
MAX_NAMES = 20
MIN_CONFIDENCE = 0.6
TIMEOUT_S = 6.0
CACHE_SIZE = 5000
RATE_PER_MINUTE = 30

GENERIC = {
    "test", "testing", "website", "web site", "site", "app", "apps", "application", "server", "servers",
    "email", "mail", "crm", "erp", "hr", "payroll", "accounting", "database", "db", "files", "backup",
    "phone", "phones", "printer", "printers", "wifi", "network", "internet", "laptop", "laptops", "portal",
    "intranet", "spreadsheet", "spreadsheets", "other", "misc", "tbd", "none", "todo", "demo", "sample",
    "custom", "inhouse", "in house", "tool", "tools", "software", "system", "aws", "azure", "gcp", "google",
    "microsoft", "amazon", "oracle", "sap", "adobe", "ibm",
}

SYSTEM = (
    "You identify commercial business software products from the names people type. "
    "For each input decide if it is a real, specific, publicly sold software product or service. "
    "If it is generic, a placeholder, gibberish, a company's internal tool name, or you are not sure, "
    "answer unknown. Never guess. Never include prices or costs. "
    "Reply with JSON only: {\"results\": [{\"input\": str, \"status\": \"suggested\"|\"unknown\", "
    "\"name\": official product name, \"vendor\": company that sells it, \"category\": short category "
    "such as CRM, ERP, HR, Finance, GIS, BI, ITSM, Security, Dev tools, Construction, Healthcare, Legal, "
    "\"hosting\": one of saas|paas|own|either|desktop, \"kind\": one of app|platform|server, "
    "\"confidence\": 0..1}]}"
)

AiCall = Callable[[list[str]], Awaitable[str]]


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def looks_unknowable(name: str) -> bool:
    """Generic words and keyboard mash never reach the model."""
    key = normalize(name)
    if len(key) < 3 or key in GENERIC or key.isdigit():
        return True
    letters = re.sub(r"[^a-z]", "", key)
    if not letters or not re.search(r"[aeiouy]", letters):
        return True
    if re.search(r"[bcdfghjklmnpqrstvwxz]{6,}", letters) or re.search(r"(.)\1{3,}", letters):
        return True
    return False


class _Lru:
    def __init__(self, size: int) -> None:
        self.size = size
        self.data: OrderedDict[str, dict[str, Any] | None] = OrderedDict()

    def get(self, key: str) -> tuple[bool, dict[str, Any] | None]:
        if key not in self.data:
            return False, None
        self.data.move_to_end(key)
        return True, self.data[key]

    def put(self, key: str, value: dict[str, Any] | None) -> None:
        self.data[key] = value
        self.data.move_to_end(key)
        while len(self.data) > self.size:
            self.data.popitem(last=False)


CACHE = _Lru(CACHE_SIZE)
_calls: dict[str, deque[float]] = {}


def rate_limited(org_key: str, now: float | None = None) -> bool:
    now = time.monotonic() if now is None else now
    window = _calls.setdefault(org_key, deque())
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= RATE_PER_MINUTE:
        return True
    window.append(now)
    return False


def reset() -> None:
    CACHE.data.clear()
    _calls.clear()


def clean_result(raw: Any) -> dict[str, Any] | None:
    """Strict: every field present and valid, confident enough, and no cost of any kind kept."""
    if not isinstance(raw, dict) or raw.get("status") != "suggested":
        return None
    try:
        confidence = float(raw.get("confidence", 0))
    except (TypeError, ValueError):
        return None
    out = {key: str(raw.get(key) or "").strip()[:120] for key in ("name", "vendor", "category")}
    hosting, kind = raw.get("hosting"), raw.get("kind")
    if not all(out.values()) or hosting not in HOSTINGS or kind not in KINDS or confidence < MIN_CONFIDENCE:
        return None
    return {**out, "hosting": hosting, "kind": kind, "confidence": round(min(confidence, 1.0), 2)}


def parse_reply(text: str, names: list[str]) -> dict[str, dict[str, Any] | None]:
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        match = re.search(r"\{[\s\S]*\}", text or "")
        data = json.loads(match.group(0)) if match else {}
    rows = data.get("results", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    by_key = {normalize(str(row.get("input", ""))): row for row in rows if isinstance(row, dict)}
    return {normalize(name): clean_result(by_key.get(normalize(name))) for name in names}


async def gemini_call(names: list[str]) -> str:
    from google.genai import types

    from app.ai.gemini_client import get_client, model_name

    response = await get_client().aio.models.generate_content(
        model=model_name(),
        contents=json.dumps({"inputs": names}),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            temperature=0,
            max_output_tokens=2048,
        ),
    )
    return response.text or ""


def _unknown(name: str) -> dict[str, Any]:
    return {"input": name, "status": "unknown"}


async def lookup(
    names: list[str],
    org_key: str,
    *,
    ai: AiCall | None = None,
    configured: bool = True,
    timeout: float = TIMEOUT_S,
) -> list[dict[str, Any]]:
    unique: list[str] = []
    for name in names[:MAX_NAMES]:
        name = (name or "").strip()[:120]
        if name and normalize(name) not in {normalize(item) for item in unique}:
            unique.append(name)
    results: dict[str, dict[str, Any] | None] = {}
    ask: list[str] = []
    for name in unique:
        key = normalize(name)
        if looks_unknowable(name):
            results[key] = None
            continue
        hit, value = CACHE.get(key)
        if hit:
            results[key] = value
        else:
            ask.append(name)
    if ask and configured and not rate_limited(org_key):
        try:
            reply = await asyncio.wait_for((ai or gemini_call)(ask), timeout=timeout)
            parsed = parse_reply(reply, ask)
            for name in ask:
                key = normalize(name)
                results[key] = parsed.get(key)
                CACHE.put(key, results[key])
        except Exception:  # timeout, quota, bad JSON: stay Custom, don't cache, try again later
            pass
    out = []
    for name in unique:
        value = results.get(normalize(name))
        out.append({"input": name, "status": "suggested", **value} if value else _unknown(name))
    return out
