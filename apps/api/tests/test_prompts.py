"""The prompts list every allowed relationship triple and the AI rules (no hand-kept copy to drift)."""

import re

from app.ai.ask.loop import SYSTEM as ASK_SYSTEM
from app.ai.prompts import CIS_EXTRACTION_SYSTEM, CIS_OBJECT_TYPES, SYSTEM_PROMPT_BASE
from app.schemas.relationships import ALLOWED_TRIPLES


def _prompt_triples() -> set[tuple[str, str, str]]:
    section = CIS_EXTRACTION_SYSTEM[CIS_EXTRACTION_SYSTEM.index("Valid relationship types") : CIS_EXTRACTION_SYSTEM.index("Output ONLY")]
    found = set()
    for rel, sources, targets in re.findall(r"^  ([a-z_]+): ([a-z_ |]+) → ([a-z_ |]+?)(?: \(.*\))?$", section, re.M):
        for source in sources.split(" | "):
            for target in targets.split(" | "):
                found.add((rel, source.strip(), target.strip()))
    return found


def test_every_allowed_triple_between_listed_types_is_in_the_prompt_and_nothing_else():
    allowed = {triple for triple in ALLOWED_TRIPLES if triple[1] in CIS_OBJECT_TYPES and triple[2] in CIS_OBJECT_TYPES}
    assert _prompt_triples() == allowed


def test_the_ai_triples_that_were_missing_are_there():
    triples = _prompt_triples()
    assert ("can_call", "agent", "agent") in triples
    assert ("can_call", "agent", "tool") in triples
    assert ("sends_data_to", "cloud_service", "data_store") in triples
    assert ("sends_data_to", "solution", "cloud_service") in triples
    assert ("runs_on", "ai_model", "cloud_service") in triples
    assert ("reads", "agent", "application") in triples and ("writes", "agent", "data_store") in triples
    assert ("calls", "application", "application") not in triples  # not an allowed triple any more


def test_ai_types_and_the_ai_feature_rule():
    assert "agent = an AI agent or bot" in CIS_EXTRACTION_SYSTEM
    assert "ai_model = an AI model an agent uses" in CIS_EXTRACTION_SYSTEM
    for prompt in (CIS_EXTRACTION_SYSTEM, SYSTEM_PROMPT_BASE, ASK_SYSTEM):
        assert "is a setting on an app, not a separate record" in prompt
    assert "AI Agent, AI Model" in ASK_SYSTEM
