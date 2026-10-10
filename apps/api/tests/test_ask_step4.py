"""Ask step 4: follow-ups carry the last 4 turns; item ids are re-checked against the workspace."""
import asyncio

from pydantic import ValidationError

from app.ai.ask import loop
from app.routers.ai import AskRequest
from tests.test_ask_engine import CTX, _text_response, engine  # noqa: F401
from tests.test_ask_step2b import sample


def test_prompt_lists_earlier_turns_and_drops_unknown_ids():
    context = [
        {"question": f"Q{i}", "summary": f"S{i}", "item_ids": []} for i in range(1, 4)
    ] + [{"question": "Which vendors do we spend the most with?", "summary": "You use 6 vendors.", "item_ids": ["1", "3", "not-in-this-workspace"]},
         {"question": "Which of those renew soon?", "summary": "", "item_ids": []}]
    prompt, earlier = loop.conversation_prompt("Which of those has no owner?", context, sample())
    assert "Q1: Q1" not in prompt and "Q2" in prompt  # only the last 4 turns
    assert "Salesforce (Application, id 1)" in prompt and "Microsoft 365" in prompt
    assert "not-in-this-workspace" not in prompt
    assert [rec.id for rec in earlier] == ["1", "3"]
    assert prompt.endswith("Current question: Which of those has no owner?")


def test_no_context_is_just_the_question():
    assert loop.conversation_prompt("What renews?", [], sample()) == ("What renews?", [])


def test_request_caps_context_at_four_turns():
    AskRequest(question="x", context=[{"question": "a"}] * 4)
    try:
        AskRequest(question="x", context=[{"question": "a"}] * 5)
        raise AssertionError("5 turns accepted")
    except ValidationError:
        pass


def test_earlier_items_can_be_cited_in_the_follow_up(engine):  # noqa: F811
    answer = {"answer_markdown": "Salesforce [1] is the biggest of those.", "citations": [{"n": 1, "record_id": "1", "relationship": "Earlier answer"}], "follow_ups": ["x"]}
    models = engine([_text_response(answer)], graph=sample())
    seen = {}
    original = models.generate_content

    async def capture(**kwargs):
        seen["prompt"] = kwargs["contents"][0].parts[0].text
        return await original(**kwargs)

    models.generate_content = capture
    context = [{"question": "Which vendors do we spend the most with?", "summary": "You use 6 vendors.", "item_ids": ["1"]}]
    result = asyncio.run(loop.answer_with_model(None, CTX, "Which is the biggest of those?", context=context))
    assert "Earlier in this conversation" in seen["prompt"]
    assert result["source"] == "llm" and result["citations"][0]["record_id"] == "1"
