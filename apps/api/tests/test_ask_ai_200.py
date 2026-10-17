"""After Gemini's HTTP 200: real google-genai response objects (thought parts, function calls with
thought signatures, MAX_TOKENS / SAFETY / MALFORMED_FUNCTION_CALL, no candidates, tool errors)."""
import asyncio
import uuid
from types import SimpleNamespace

from google.genai import types

from app.ai.ask import loop
from tests.test_ask_engine import GOOD, FakeModels, _call_response, _reply, _text_response, renewal_graph

CTX = SimpleNamespace(workspace=SimpleNamespace(id=uuid.uuid4()), org_id=uuid.uuid4())


def _run(monkeypatch, script, question="What renews in the next 90 days?"):
    models = FakeModels(script)
    configs = []
    original = models.generate_content

    async def spy(**kwargs):
        configs.append(kwargs["config"])
        return await original(**kwargs)

    models.generate_content = spy
    monkeypatch.setattr(loop, "is_configured", lambda: True)
    monkeypatch.setattr(loop, "model_name", lambda: "gemini-2.5-flash")
    monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))

    async def collect():
        return [e async for e in loop.run_ask(None, CTX, question, graph=renewal_graph())]

    events = asyncio.run(collect())
    return events, events[-1]["data"], [e["data"]["label"] for e in events if e["event"] == "step"], configs


def _thinking_only(finish):
    return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role="model", parts=[types.Part(text="…", thought=True)]), finish_reason=finish)],
                                         usage_metadata=types.GenerateContentResponseUsageMetadata(candidates_token_count=0, thoughts_token_count=900))


AGG = ("aggregate", {"type": "application", "metric": "sum_annual_cost", "filters": {"renewal_within_days": 90}})


def test_thinking_is_off_and_the_output_cap_leaves_room(monkeypatch):
    _, final, _, configs = _run(monkeypatch, [_call_response(*AGG), _text_response(GOOD)])
    assert final["source"] == "llm"
    assert configs[0].thinking_config.thinking_budget == 0 and configs[0].max_output_tokens == 1024


def test_thought_only_max_tokens_reply_is_retried_then_reported(monkeypatch):
    # The prod symptom: HTTP 200, all thinking, finish_reason MAX_TOKENS, no text (old code: "not_json").
    _, final, labels, _ = _run(monkeypatch, [_call_response(*AGG), _thinking_only("MAX_TOKENS"), _text_response(GOOD)])
    assert final["source"] == "llm" and any("asked again" in label and "MAX_TOKENS" in label for label in labels)
    _, final, labels, _ = _run(monkeypatch, [_call_response(*AGG), _thinking_only("MAX_TOKENS"), _thinking_only("MAX_TOKENS")])
    assert final["fallback_reason"] == "max_tokens" and "thinking 900" in final["fallback_detail"]
    assert "[reason: max_tokens]" in labels[-1]


def test_malformed_function_call_and_blocked_replies(monkeypatch):
    malformed = types.GenerateContentResponse(candidates=[types.Candidate(content=None, finish_reason="MALFORMED_FUNCTION_CALL")])
    _, final, _, _ = _run(monkeypatch, [malformed, _call_response(*AGG), _text_response(GOOD)])
    assert final["source"] == "llm"
    _, final, labels, _ = _run(monkeypatch, [_thinking_only("SAFETY")])
    assert final["fallback_reason"] == "blocked" and "[reason: blocked]" in labels[-1]
    _, final, _, _ = _run(monkeypatch, [types.GenerateContentResponse(candidates=[])])
    assert final["fallback_reason"] == "blocked" and "NO_CANDIDATES" in final["fallback_detail"]


def test_response_text_is_never_read():
    class Exploding:
        candidates = [SimpleNamespace(content=types.Content(role="model", parts=[types.Part(text="hidden", thought=True), types.Part.from_text(text='{"a": 1}')]))]

        @property
        def text(self):
            raise ValueError("response.text must not be used")

    assert loop._text(Exploding()) == '{"a": 1}'
    assert loop._text(SimpleNamespace(candidates=None)) == ""


def test_a_failing_lookup_goes_back_to_the_model(monkeypatch):
    def broken(bag, name, args):
        raise KeyError("yes_no")

    monkeypatch.setattr(loop, "run_tool", broken)
    _, final, labels, _ = _run(monkeypatch, [_call_response("filter_records", {"vendor": "Adobe"}), _text_response({"answer_markdown": "I could not find that.", "unsupported": True, "citations": []})])
    assert final["source"] == "llm" and final["unsupported"] is True
    assert any(label.startswith("Lookup filter_records failed: KeyError") for label in labels)


def test_every_fallback_has_a_reason_step(monkeypatch):
    # An unknown id is now repaired without a call; an inferred verdict with no evidence can't be.
    bad = {"answer_markdown": "99 things [1].", "citations": [{"n": 1, "record_id": "nope"}], "verdict": {"text": "Likely 99", "inferred": True}, "evidence": []}
    _, final, labels, _ = _run(monkeypatch, [_call_response(*AGG), _text_response(bad), _text_response(bad)])
    assert final["fallback_reason"] == "inferred_without_evidence" and labels[-1].endswith("[reason: inferred_without_evidence]")
    assert "99" not in labels[-1]


def test_budget_fits_the_30s_proxy_with_room_for_rounds():
    assert loop.TOTAL_BUDGET_SECONDS == 25 and loop.MIN_CALL_WINDOW_SECONDS == 3
    from app.ai.ask.stream import PING_SECONDS

    assert PING_SECONDS <= 5


# ── number grounding (the confirmed prod failure: "needed a correction (a number that isn't in the lookups)") ──


def _answer(markdown):
    return {"answer_markdown": markdown, "citations": [{"n": 1, "record_id": "a0", "relationship": "Renews soon"}]}


def test_derived_numbers_pass_without_a_correction(monkeypatch):
    # 17 / 16 come from the estate step, 35% = 6 of 17, $210k rounds the lookup's 210,000, 2nd is an ordinal.
    text = "Of your 17 items, 16 are Applications; 6 renew in the next 90 days [1], about 35% of the estate and roughly $210k a year. The 2nd renews soonest in 2026."
    _, final, labels, _ = _run(monkeypatch, [_call_response(*AGG), _text_response(_answer(text))])
    assert final["source"] == "llm", final.get("fallback_reason")
    assert not any("correction" in label for label in labels)


def test_list_length_and_counts_per_kind_from_tool_rows(monkeypatch):
    from app.ai.ask.grounding import harvest, ungrounded

    allowed: set[str] = set()
    harvest({"items": [{"name": "A", "kind": "SaaS", "annual_cost": 100}, {"name": "B", "kind": "SaaS", "annual_cost": 250}, {"name": "Microsoft 365", "kind": "Server", "annual_cost": None}]}, allowed)
    assert ungrounded("3 items, 2 SaaS, $350 in total; Microsoft 365 too", allowed) == []
    assert ungrounded("There are 47 servers", allowed) == ["47"]


def test_still_ungrounded_after_a_correction_drops_only_that_sentence(monkeypatch):
    bad = _answer("6 Applications renew in the next 90 days [1]. That would save 4,321 dollars.")
    _, final, labels, _ = _run(monkeypatch, [_call_response(*AGG), _text_response(bad), _text_response(bad)])
    assert final["source"] == "llm"
    assert final["answer_text"] == "6 Applications renew in the next 90 days [1]."
    assert "4,321" not in str(final) or "left out" in labels[-1]
    assert any("left out 1 number" in label for label in labels)


def test_nothing_left_after_softening_is_a_real_fallback(monkeypatch):
    bad = {"answer_markdown": "4,321 dollars could be saved.", "citations": []}
    _, final, _, _ = _run(monkeypatch, [_text_response(bad), _text_response(bad)])
    assert final["fallback_reason"] == "ungrounded_number"
    # With a table from tool data, the table still shows under a neutral line.
    _, final, _, _ = _run(monkeypatch, [_call_response(*AGG), _text_response(bad), _text_response(bad)])
    assert final["source"] == "llm" and final["answer_text"] == "Here is what the lookups returned." and "4,321" not in str(final)
