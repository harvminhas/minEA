import unittest
from datetime import datetime
from uuid import uuid4

from pydantic import ValidationError

from app.schemas.relationships import (
    ALLOWED_TRIPLES,
    HOSTING_ON_APPLICATION,
    RelationshipCreate,
    identical_relationship,
)


def _create(rel_type: str, from_type: str, to_type: str) -> RelationshipCreate:
    return RelationshipCreate(
        type=rel_type,
        from_object_id=uuid4(),
        from_type=from_type,
        to_object_id=uuid4(),
        to_type=to_type,
    )


class RelationshipRulesTests(unittest.TestCase):
    def test_json_matches_allowed_triples(self):
        import json
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[3]
            / "packages"
            / "types"
            / "src"
            / "relationship-rules.json"
        )
        loaded = {tuple(item) for item in json.loads(path.read_text(encoding="utf-8"))}
        self.assertEqual(loaded, ALLOWED_TRIPLES)
        self.assertFalse(any(part == "initiative" for triple in loaded for part in triple))

    def test_app_to_app_hosting_is_rejected_with_the_alternative(self):
        for rel_type in ("runs_on", "built_on"):
            with self.assertRaises(ValidationError) as ctx:
                _create(rel_type, "application", "application")
            self.assertIn(HOSTING_ON_APPLICATION, str(ctx.exception))

    def test_app_runs_on_a_platform_and_depends_on_an_app(self):
        self.assertEqual(_create("runs_on", "application", "cloud_service").type, "runs_on")
        self.assertEqual(_create("depends_on", "application", "application").type, "depends_on")

    def test_hosting_targets_are_platforms_or_servers(self):
        forbidden = {"application", "solution", "technical_capability", "component"}
        for rel_type, _source, target in ALLOWED_TRIPLES:
            if rel_type in {"runs_on", "built_on"}:
                self.assertNotIn(target, forbidden)

    def test_app_to_app_verbs(self):
        verbs = {
            rel_type
            for rel_type, source, target in ALLOWED_TRIPLES
            if source == "application" and target == "application"
        }
        self.assertEqual(verbs, {"depends_on", "sends_data_to", "part_of", "replaces"})
        self.assertNotIn(("calls", "application", "application"), ALLOWED_TRIPLES)
        self.assertNotIn(("exposes", "application", "tool"), ALLOWED_TRIPLES)
        self.assertIn(("affects", "roadmap_item", "application"), ALLOWED_TRIPLES)
        self.assertIn(("uses_model", "agent", "ai_model"), ALLOWED_TRIPLES)
        self.assertNotIn(("uses_model", "agent", "model"), ALLOWED_TRIPLES)

    def test_app_to_vendor_data_link_is_rejected(self):
        with self.assertRaises(ValidationError):
            _create("sends_data_to", "application", "external_party")
        _create("supplied_by", "application", "external_party")
        _create("supplied_by", "cloud_service", "external_party")
        _create("supplied_by", "model", "external_party")
        _create("sends_data_to", "cloud_service", "external_party")

    def test_identical_relationship_returns_the_existing_row(self):
        class Row:
            def __init__(self, rel_type, from_id, to_id, row_id):
                self.type = rel_type
                self.from_object_id = from_id
                self.to_object_id = to_id
                self.id = row_id

        first = Row("located_at", "as400", "east", "e1")
        second = Row("located_at", "as400", "east", "e2")
        other = Row("depends_on", "as400", "east", "d")
        found = identical_relationship([other, first, second], "located_at", "as400", "east")
        self.assertIs(found, first)
        self.assertIsNone(identical_relationship([other], "located_at", "as400", "east"))

    def test_ai_agent_and_model_links(self):
        accepted = [
            ("uses_model", "agent", "ai_model"),
            ("can_call", "agent", "agent"),
            ("built_on", "agent", "cloud_service"),
            ("built_on", "agent", "tool"),
            ("runs_on", "ai_model", "cloud_service"),
            ("supplied_by", "ai_model", "external_party"),
            ("reads", "agent", "application"),
            ("reads", "agent", "cloud_service"),
            ("reads", "agent", "data_store"),
            ("writes", "agent", "application"),
            ("writes", "agent", "cloud_service"),
            ("writes", "agent", "data_store"),
            ("reads", "agent", "solution"),
            ("writes", "agent", "technical_capability"),
        ]
        for rel_type, source, target in accepted:
            self.assertEqual(_create(rel_type, source, target).type, rel_type)
        with self.assertRaises(ValidationError):
            _create("uses_model", "agent", "model")
        with self.assertRaises(ValidationError) as hosted:
            _create("built_on", "agent", "application")
        self.assertIn(HOSTING_ON_APPLICATION, str(hosted.exception))
        with self.assertRaises(ValidationError):
            _create("sends_data_to", "data_store", "application")

    def test_type_switch_labels_match_the_label_map(self):
        import re
        from pathlib import Path

        from app.services.type_switch import _LABELS

        path = (
            Path(__file__).resolve().parents[3]
            / "packages"
            / "types"
            / "src"
            / "relationship-labels.ts"
        )
        source = path.read_text(encoding="utf-8")
        found = {
            name: (forward, reverse)
            for name, forward, reverse in re.findall(
                r'^\s+(\w+): label\("([^"]+)", "([^"]+)"',
                source,
                re.M,
            )
        }
        self.assertGreater(len(found), 30)
        self.assertEqual(found, _LABELS)

    def test_workspace_copy_keeps_ai_models(self):
        from app.services.workspace_copy_layers import object_types_for_layers

        self.assertIn("ai_model", object_types_for_layers(["application"]))


if __name__ == "__main__":
    unittest.main()
