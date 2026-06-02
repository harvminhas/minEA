"""
AI chat with workspace context via Gemini Flash.

Uses non-streaming generate_content because google-genai async streaming is
incompatible with aiohttp 3.13; response text is chunked for the SSE UI.
"""
import json
from collections.abc import AsyncGenerator

from google.genai import types

from app.ai.gemini_client import (
    format_api_error,
    get_client,
    is_configured,
    messages_to_contents,
    model_name,
    not_configured_message,
)
from app.ai.prompts import SYSTEM_PROMPT_BASE

SSE_CHUNK_SIZE = 48


async def stream_chat(
    workspace_context: dict,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-formatted strings: data: <chunk>\n\n
    The final event is data: [DONE]\n\n
    """
    if not is_configured():
        yield f'data: {json.dumps({"type": "error", "message": not_configured_message()})}\n\n'
        yield "data: [DONE]\n\n"
        return

    context_json = json.dumps(workspace_context, indent=2)
    system_instruction = (
        f"{SYSTEM_PROMPT_BASE}\n\n"
        f"## Current Architecture Model\n\n```json\n{context_json}\n```"
    )

    contents = messages_to_contents(messages)
    if not contents:
        yield f'data: {json.dumps({"type": "error", "message": "No messages to send."})}\n\n'
        yield "data: [DONE]\n\n"
        return

    try:
        response = await get_client().aio.models.generate_content(
            model=model_name(),
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                max_output_tokens=4096,
            ),
        )
        text = response.text or ""
        for i in range(0, len(text), SSE_CHUNK_SIZE):
            chunk = text[i : i + SSE_CHUNK_SIZE]
            yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'message': format_api_error(exc)})}\n\n"

    yield "data: [DONE]\n\n"
