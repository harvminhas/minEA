"""The shared relationship wording registry (app/data/relationship_labels.json)."""
import json
from pathlib import Path

from app.schemas.relationships import ALLOWED_TRIPLES
from app.services.relationship_labels import (
    ACCOUNTABILITY,
    DATA_PATH,
    TYPES,
    accountability_words,
    is_mutual,
    relationship_words,
)

SHARED = Path(__file__).resolve().parents[3] / "packages" / "types" / "src" / "relationship-labels.json"


def test_api_copy_matches_the_shared_registry():
    assert json.loads(DATA_PATH.read_text(encoding="utf-8")) == json.loads(SHARED.read_text(encoding="utf-8"))


def test_every_allowed_type_has_wording():
    for rel_type, source, target in ALLOWED_TRIPLES:
        assert rel_type in TYPES, rel_type
        words = relationship_words(rel_type, source, target)
        assert words.sentence("A", "B").index("A") < words.sentence("A", "B").index("B")
        assert words.reverse_sentence("A", "B").index("B") < words.reverse_sentence("A", "B").index("A")
        assert "inbound" not in words.reverse.lower()


def test_unique_per_type_pair():
    forward: dict[tuple, str] = {}
    reverse: dict[tuple, str] = {}
    for rel_type, source, target in ALLOWED_TRIPLES:
        if rel_type == "calls":
            continue
        words = relationship_words(rel_type, source, target)
        for seen, key in ((forward, (source, target, words.forward)), (reverse, (source, target, words.reverse))):
            assert seen.get(key, rel_type) == rel_type, key
            seen[key] = rel_type


def test_reverse_words_and_overrides():
    assert relationship_words("runs_on").reverse_sentence("Salesforce", "Azure") == "Azure hosts Salesforce"
    assert relationship_words("runs_on", "ai_model", "cloud_service").forward == "Accessed through"
    assert relationship_words("supplied_by").reverse == "Supplies"
    assert relationship_words("subscribes").sentence("A", "B") == "A subscribes to B"
    assert relationship_words("authenticates_via").sentence("A", "B") == "A signs in with B"
    assert relationship_words("some_future_link").forward == "Some future link"
    assert is_mutual("depends_on") and not is_mutual("runs_on")


def test_accountability_words():
    assert accountability_words("owns") == ("Owns", "Owned by")
    assert set(ACCOUNTABILITY) == {"owns", "performs", "approves", "informed", "stewards", "manages"}
