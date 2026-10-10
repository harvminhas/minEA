"""Ask step 3b: no false correction on true vendor sub-counts; the check says what failed."""
from app.ai.ask import loop, steps
from app.ai.ask.tools import ToolBag, run_tool
from tests.test_ask_step2b import VENDORS, sample


def _bag():
    bag = ToolBag(graph=sample(), seen_ids=set(), numbers=set())
    run_tool(bag, "aggregate", VENDORS)
    return bag


def _check(text):
    return loop._validate({"answer_markdown": text, "citations": [], "follow_ups": ["a"]}, _bag(), "Which vendors do we spend the most with?")


def test_true_sub_counts_pass():
    assert _check("You spend $34,248 a year across 6 vendors (2 with no cost recorded). 99% goes to three vendors.") is None
    assert _check("You use 6 vendors; 4 vendors have a cost recorded, and 2 vendors without a cost.") is None


def test_unqualified_wrong_count_still_fails():
    assert _check("You spend $34,248 a year across 4 vendors.") == "vendor_count"


def test_no_cost_count_is_a_known_number():
    bag = _bag()
    assert "2" in bag.numbers
    assert run_tool(ToolBag(graph=sample(), seen_ids=set(), numbers=set()), "aggregate", VENDORS)["vendors_without_cost"] == 2


def test_correction_step_says_why():
    assert steps.checking_step("vendor_count")["label"].endswith("(a vendor count that didn't match the vendor list)")
    assert steps.checking_step("ungrounded_number")["label"].endswith("(a number that isn't in the lookups)")
    assert steps.checking_step(None)["label"] == "Checked every name and number against the lookups"
