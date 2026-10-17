"""Per-phase timing for one Ask request: one structured log line and a compact line for the steps.

Measurement only. Phases: auth/quota (the handler's permission + allowance check), workspace load,
context build (chars, ~tokens), each model call (latency, tokens, finish reason), each lookup,
the numbers check, the correction round, and the total.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class AskTiming:
    clock: Any = time.perf_counter
    started: float = 0.0
    phases: dict[str, float] = field(default_factory=dict)  # auth, workspace, context, check (seconds)
    context_chars: int = 0
    calls: list[dict] = field(default_factory=list)
    tools: list[dict] = field(default_factory=list)
    cache_hit: bool | None = None  # workspace graph reused from the in-process cache
    cache: dict = field(default_factory=dict)  # {"hit", "why", "fingerprint_s"}
    repairs: list[str] = field(default_factory=list)
    bad_reply: str = ""  # redacted first 300 chars of a reply that wasn't JSON  # structural slips fixed without a model call
    corrected: bool = False
    correction_s: float = 0.0
    outcome: str = ""

    def __post_init__(self):
        if not self.started:
            self.started = self.clock()

    def add(self, phase: str, seconds: float) -> None:
        self.phases[phase] = self.phases.get(phase, 0.0) + max(0.0, seconds)

    def note_repairs(self, notes: list[str]) -> None:
        self.repairs.extend(notes)

    def model_call(self, seconds: float, response: Any, finish: str, *, correction: bool = False, why: str = "", streamed: bool = False) -> None:
        usage = getattr(response, "usage_metadata", None)
        tok = lambda name: int(getattr(usage, name, None) or 0) if usage is not None else 0  # noqa: E731
        self.calls.append({
            "s": round(seconds, 3),
            "in": tok("prompt_token_count"),
            "out": tok("candidates_token_count"),
            "think": tok("thoughts_token_count"),
            "finish": finish,
            "why": why or "first",
            **({"streamed": True} if streamed else {}),
            **({"correction": True} if correction else {}),
        })
        if correction:
            self.correction_s += seconds

    def tool(self, name: str, seconds: float) -> None:
        self.tools.append({"name": name, "s": round(seconds, 3)})

    @property
    def total(self) -> float:
        return self.clock() - self.started

    def as_dict(self) -> dict:
        ai = sum(c["s"] for c in self.calls)
        return {
            "total_s": round(self.total, 3),
            **{f"{k}_s": round(v, 3) for k, v in self.phases.items()},
            "context_chars": self.context_chars,
            "cache_hit": self.cache_hit,
            "cache": self.cache,
            "repairs": self.repairs,
            **({"bad_reply": self.bad_reply} if self.bad_reply else {}),
            "context_tokens_est": self.context_chars // 4,
            "ai_calls": len(self.calls),
            "ai_s": round(ai, 3),
            "tokens_in": sum(c["in"] for c in self.calls),
            "tokens_out": sum(c["out"] for c in self.calls),
            "tokens_thinking": sum(c["think"] for c in self.calls),
            "lookups": len(self.tools),
            "lookups_s": round(sum(t["s"] for t in self.tools), 3),
            "corrected": self.corrected,
            "correction_s": round(self.correction_s, 3),
            "outcome": self.outcome,
            "calls": self.calls,
            "tools": self.tools,
        }

    def log_line(self) -> str:
        d = self.as_dict()
        flat = " ".join(f"{k}={v}" for k, v in d.items() if k not in {"calls", "tools", "cache", "repairs", "bad_reply"})
        return f"ASK_TIMING {flat} cache={json.dumps(self.cache, separators=(',', ':'))} repairs={json.dumps(self.repairs)} bad_reply={json.dumps(self.bad_reply)} calls={json.dumps(d['calls'], separators=(',', ':'))} tools={json.dumps(d['tools'], separators=(',', ':'))}"

    def summary(self) -> str:
        """'Took 6.2s: workspace 0.3s · AI 2 calls 5.1s · lookups 0.2s · check 0.1s'."""
        d = self.as_dict()
        parts = []
        workspace = self.phases.get("workspace", 0.0) + self.phases.get("context", 0.0)
        if "workspace" in self.phases or "context" in self.phases:
            parts.append(f"workspace {workspace:.1f}s" + (" (cached)" if self.cache_hit else ""))
        if self.calls:
            parts.append(f"AI {len(self.calls)} call{'s' if len(self.calls) != 1 else ''} {d['ai_s']:.1f}s")
        if self.tools:
            parts.append(f"lookups {d['lookups_s']:.1f}s")
        if "check" in self.phases:
            parts.append(f"check {self.phases['check']:.1f}s")
        if self.corrected:
            parts.append(f"incl. correction {self.correction_s:.1f}s")
        return f"Took {d['total_s']:.1f}s" + (": " + " · ".join(parts) if parts else "")

    def step(self) -> dict:
        return {"id": "timing", "status": "done", "label": self.summary()}

    def details(self) -> dict:
        """What the screen's Timing details list shows."""
        return {"calls": self.calls, "cache": self.cache, "repairs": self.repairs, "phases": {k: round(v, 3) for k, v in self.phases.items()}}

    def emit(self) -> None:
        # WARNING so it shows in Vercel's logs whatever the level config; one line, prefix ASK_TIMING.
        logger.warning(self.log_line())
