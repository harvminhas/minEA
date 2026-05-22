"""
Streaming AI chat with prompt-cached workspace context.

Uses Anthropic's cache_control: ephemeral on the system prompt to cut costs ~80%
for repeated queries against the same workspace model.
"""
import json
from collections.abc import AsyncGenerator

import anthropic

from app.ai.prompts import SYSTEM_PROMPT_BASE
from app.config import settings

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def stream_chat(
    workspace_context: dict,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-formatted strings: data: <chunk>\n\n
    The final event is data: [DONE]\n\n
    """
    context_json = json.dumps(workspace_context, indent=2)

    system = [
        {
            "type": "text",
            "text": SYSTEM_PROMPT_BASE,
        },
        {
            "type": "text",
            "text": f"## Current Architecture Model\n\n```json\n{context_json}\n```",
            "cache_control": {"type": "ephemeral"},  # Cache the context — cuts cost ~80%
        },
    ]

    # Convert frontend message format to Anthropic format
    anthropic_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant")
    ]

    async with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=system,
        messages=anthropic_messages,
    ) as stream:
        async for text in stream.text_stream:
            yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"

    yield "data: [DONE]\n\n"
