"""POST /ai/ask/stream: the Ask engine as Server-Sent Events.

Frames, in order:
  meta    {"version": 1}                      always first
  step    an AskStep, sent as each lookup finishes (live working)
  delta   {"text": "..."}                     chunks of the CHECKED answer text, only after the
                                              check passed (no unverified text ever streams)
  final   the same dict POST /ai/ask returns (source llm|fallback, plus steps)
  error   {"code": "..."}                     the engine broke; the client falls back to /ai/ask
  done    {}                                  always last, even after an error
Comment lines (": ping") keep the connection alive while the model thinks.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from app.ai.ask.loop import _fallback, run_ask

logger = logging.getLogger(__name__)

PING_SECONDS = 8.0
CHUNK_WORDS = 6
# Pause between text chunks so they reach the screen as separate paints instead of one frame
# (the whole checked answer exists already; without a pause every chunk lands in the same tick).
DELTA_PAUSE_SECONDS = 0.03  # the browser also paces the reveal (lib/ask/stream.ts revealMs)
PROTOCOL_VERSION = 1


def frame(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str, separators=(',', ':'))}\n\n"


def chunks(text: str, words: int = CHUNK_WORDS) -> list[str]:
    """Split checked text into small pieces that join back to exactly the same string."""
    if not text:
        return []
    parts = re.findall(r"\S+\s*|\s+", text)
    out: list[str] = []
    for i in range(0, len(parts), words):
        out.append("".join(parts[i : i + words]))
    return out


async def ask_events(
    source: AsyncIterator[dict], *, ping_seconds: float = PING_SECONDS, delta_pause: float = DELTA_PAUSE_SECONDS
) -> AsyncIterator[str]:
    """Turn engine events into SSE frames, with pings while waiting. `done` is always last."""
    yield frame("meta", {"version": PROTOCOL_VERSION})
    steps: list[dict] = []
    final: dict | None = None
    iterator = source.__aiter__()
    pending: asyncio.Task | None = None
    try:
        while True:
            if pending is None:
                pending = asyncio.ensure_future(iterator.__anext__())
            done, _ = await asyncio.wait({pending}, timeout=ping_seconds)
            if not done:
                yield ": ping\n\n"
                continue
            task, pending = pending, None
            try:
                event = task.result()
            except StopAsyncIteration:
                break
            if event.get("event") == "step":
                steps.append(event["data"])
                yield frame("step", event["data"])
            elif event.get("event") == "final":
                final = event["data"]
        if final is None:
            final = _fallback("model_error", [])
        final = {**final, "steps": steps}
        # The engine only yields an llm final after the check passed, so this text is verified.
        if final.get("source") == "llm":
            for index, piece in enumerate(chunks(str(final.get("answer_text") or ""))):
                if index and delta_pause:
                    await asyncio.sleep(delta_pause)
                yield frame("delta", {"text": piece})
        yield frame("final", final)
    except Exception:  # never a bare broken stream: tell the client, then end cleanly
        logger.exception("ask stream failed")
        yield frame("error", {"code": "stream_failed"})
    finally:
        if pending is not None:
            pending.cancel()
        yield frame("done", {})


async def stream_ask(db, ctx, question: str, graph=None, context: list[dict] | None = None) -> AsyncIterator[str]:
    async for piece in ask_events(run_ask(db, ctx, question, graph=graph, context=context)):
        yield piece
