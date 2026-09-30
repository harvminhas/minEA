import unittest

from app.ai.ask.graph import Rec, WorkspaceGraph
from app.ai.ask.loop import _validate
from app.ai.ask.tools import ToolBag


def _rec(record_id: str) -> Rec:
    return Rec(
        id=record_id,
        raw_type="application",
        type="application",
        name=record_id,
        kind="Application",
        owner_team=None,
        owner_person=None,
        vendor=None,
        vendor_names=[],
        annual=None,
        cost_note=None,
        renewal=None,
        lifecycle=None,
        criticality=None,
    )


def _bag() -> ToolBag:
    graph = WorkspaceGraph(records={"a": _rec("a"), "b": _rec("b")}, edges=[])
    return ToolBag(graph=graph, seen_ids={"a", "b"}, numbers=set())


class AskStrategyValidationTest(unittest.TestCase):
    def test_fix_action_for_an_uncited_record_is_rejected(self) -> None:
        answer = {
            "answer_markdown": "Likely high",
            "citations": [{"n": 1, "record_id": "a", "relationship": "Evidence"}],
            "follow_ups": ["What breaks if it goes down?"],
            "verdict": {"text": "Likely high", "inferred": True, "basis": ["supports a capability"]},
            "evidence": [{"text": "A related item stops working.", "citation_ids": ["a"]}],
            "fix_actions": [{"record_id": "b", "field": "criticality", "suggested_value": "high"}],
        }
        self.assertEqual(_validate(answer, _bag(), "How important is A?"), "uncited_fix_action")

    def test_inferred_verdict_without_evidence_is_rejected(self) -> None:
        answer = {
            "answer_markdown": "Likely high",
            "citations": [{"n": 1, "record_id": "a", "relationship": ""}],
            "follow_ups": ["What breaks if it goes down?"],
            "verdict": {"text": "Likely high", "inferred": True, "basis": []},
            "evidence": [],
            "fix_actions": [],
        }
        self.assertEqual(_validate(answer, _bag(), "How important is A?"), "inferred_without_evidence")


if __name__ == "__main__":
    unittest.main()
