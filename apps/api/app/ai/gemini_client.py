"""Shared Google Gemini client for chat, insights, and ingestion."""
from __future__ import annotations

import os
import re

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import ClientError

from app.config import API_ROOT

_client: genai.Client | None = None
_client_key: str | None = None

DEFAULT_MODEL = "gemini-2.5-flash"

# Retired 2026-06-01 — remap if still present in env or cached settings.
RETIRED_MODELS = {
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
}


def _refresh_env() -> None:
    # Vercel injects env vars at runtime — no apps/api/.env on disk.
    if os.getenv("VERCEL") == "1":
        return
    env_file = API_ROOT / ".env"
    if env_file.is_file():
        load_dotenv(env_file, override=True)


def _resolve_model(raw: str | None) -> str:
    model = (raw or DEFAULT_MODEL).strip()
    if model in RETIRED_MODELS:
        return DEFAULT_MODEL
    return model


def api_key() -> str:
    _refresh_env()
    return (os.getenv("GOOGLE_API_KEY") or "").strip()


def is_configured() -> bool:
    return bool(api_key())


def get_client() -> genai.Client:
    global _client, _client_key
    key = api_key()
    if _client is None or _client_key != key:
        _client = genai.Client(api_key=key)
        _client_key = key
    return _client


def model_name() -> str:
    _refresh_env()
    return _resolve_model(os.getenv("GEMINI_MODEL"))


def not_configured_message() -> str:
    if os.getenv("VERCEL") == "1":
        return "AI is not configured. Set GOOGLE_API_KEY in the Vercel project environment variables."
    return "AI is not configured. Set GOOGLE_API_KEY in apps/api/.env and restart the API server."


def is_quota_error(exc: BaseException) -> bool:
    if isinstance(exc, ClientError) and getattr(exc, "code", None) == 429:
        return True
    message = str(exc)
    return "429" in message or "RESOURCE_EXHAUSTED" in message or "quota" in message.lower()


def format_api_error(exc: BaseException) -> str:
    if is_quota_error(exc):
        model = model_name()
        retry = _extract_retry_seconds(str(exc))
        retry_note = f" Retry in ~{retry}s." if retry else ""
        return (
            f"Gemini API quota exceeded for {model} on the free tier.{retry_note} "
            "Wait for the limit to reset, enable billing, or try GEMINI_MODEL=gemini-2.5-flash-lite."
        )
    return str(exc)


def _extract_retry_seconds(message: str) -> int | None:
    match = re.search(r"retry in (\d+(?:\.\d+)?)s", message, re.IGNORECASE)
    if not match:
        return None
    return max(1, int(float(match.group(1))))


def build_gemini_tools(tools: list[dict]) -> list[types.Tool]:
    declarations = [
        types.FunctionDeclaration(
            name=tool["name"],
            description=tool["description"],
            parameters_json_schema=tool["input_schema"],
        )
        for tool in tools
    ]
    return [types.Tool(function_declarations=declarations)]


def messages_to_contents(messages: list[dict]) -> list[types.Content]:
    contents: list[types.Content] = []
    for message in messages:
        if message.get("role") not in ("user", "assistant"):
            continue
        role = "user" if message["role"] == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=message["content"])],
            )
        )
    return contents
