"""Relationship and accountability wording, read from the shared registry.

Data: app/data/relationship_labels.json, a byte-for-byte copy of
packages/types/src/relationship-labels.json (the web reads that one). tests/test_relationship_labels.py
keeps the two in step. A relationship is stored once, source -> target; ``forward`` / ``sentence``
read from the source, ``reverse`` / ``reverse_sentence`` from the target.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "relationship_labels.json"
DATA = json.loads(DATA_PATH.read_text(encoding="utf-8"))
TYPES: dict[str, dict] = DATA["types"]
ACCOUNTABILITY: dict[str, dict] = DATA["accountability"]
ACCOUNTABILITY_OWNER_LEGACY: dict[str, str] = DATA["accountability_owner_legacy"]


@dataclass(frozen=True)
class RelationshipWords:
    forward: str
    reverse: str
    sentence_template: str
    reverse_template: str
    symmetric: bool = False
    mutual: bool = False

    def sentence(self, source: str, target: str) -> str:
        """Read from the stored source: "Salesforce runs on Azure"."""
        return self.sentence_template.replace("{from}", source).replace("{to}", target)

    def reverse_sentence(self, source: str, target: str) -> str:
        """Read from the stored target: "Azure hosts Salesforce"."""
        if self.symmetric:
            return self.sentence_template.replace("{from}", target).replace("{to}", source)
        return self.reverse_template.replace("{from}", source).replace("{to}", target)


def _plain(code: str) -> str:
    return (code or "linked").replace("_", " ").strip()


def _words(entry: dict) -> RelationshipWords:
    symmetric = bool(entry.get("symmetric"))
    return RelationshipWords(
        forward=entry["forward"],
        reverse=entry["forward"] if symmetric else entry["reverse"],
        sentence_template=entry["sentence"],
        reverse_template=entry["sentence"] if symmetric else entry["reverse_sentence"],
        symmetric=symmetric,
        mutual=bool(entry.get("mutual")),
    )


def relationship_words(code: str, from_type: str | None = None, to_type: str | None = None) -> RelationshipWords:
    """Words for one link type, with any per-type-pair override when both end types are given."""
    entry = TYPES.get(code)
    if entry is None:
        plain = _plain(code)
        return RelationshipWords(
            forward=plain[:1].upper() + plain[1:],
            reverse="Linked from",
            sentence_template="{from} " + plain + " {to}",
            reverse_template="{to} is linked from {from}",
        )
    # Both ends must be known: runs_on to a platform reads "Accessed through" only for an AI model.
    if from_type and to_type:
        for override in entry.get("overrides") or []:
            if from_type in override.get("from", []) and to_type in override.get("to", []):
                return _words({**entry, **{k: v for k, v in override.items() if k not in ("from", "to")}})
    return _words(entry)


def relationship_sentence(code: str, source: str, target: str, from_type: str | None = None, to_type: str | None = None) -> str:
    return relationship_words(code, from_type, to_type).sentence(source, target)


def is_mutual(code: str) -> bool:
    """Both ends may record this link (A depends on B and B depends on A are different facts)."""
    entry = TYPES.get(code) or {}
    return bool(entry.get("mutual") or entry.get("symmetric"))


def accountability_words(kind: str) -> tuple[str, str]:
    """(forward, reverse): ("Owns", "Owned by")."""
    entry = ACCOUNTABILITY.get(kind)
    if entry is None:
        plain = _plain(kind)
        return plain[:1].upper() + plain[1:], plain[:1].upper() + plain[1:]
    return entry["forward"], entry["reverse"]
