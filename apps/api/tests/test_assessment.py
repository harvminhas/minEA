import pytest

from app.schemas.assessment import (
    apply_functional_assessment,
    apply_nonfunctional_assessment,
    coverage_score_from_percent,
    fitness_from_scores,
    validate_functional_assessment,
    validate_nonfunctional_assessment,
    weakest_score,
)
from app.schemas.relationships import merge_attributes


def test_coverage_bands_and_fitness_derivation():
    assert coverage_score_from_percent(24) == 1
    assert coverage_score_from_percent(70) == 4
    assert coverage_score_from_percent(100) == 5
    assert weakest_score([5, 2, 4]) == 2
    assert fitness_from_scores([5, 4]) == "strong"
    assert fitness_from_scores([3]) == "adequate"
    assert fitness_from_scores([1, 5]) == "weak"


def test_merge_attributes_derives_fitness_and_rejects_files():
    merged = merge_attributes(
        "supported_by",
        {"fitness": "strong", "disposition": "keep"},
        {
            "functional_assessment": {
                "scores": {
                    "automation": {
                        "score": 2,
                        "confidence": "M",
                        "evidence": [{"kind": "note", "text": "Manual re-key"}],
                    }
                },
                "gaps": ["Canada consent"],
                "regional_scope": "both",
            }
        },
    )
    assert merged["fitness"] == "weak"
    assert merged["functional_assessment"]["scores"]["automation"]["score"] == 2
    assert merged["disposition"] == "keep"

    with pytest.raises(ValueError, match="file attachments"):
        merge_attributes(
            "supported_by",
            {},
            {
                "functional_assessment": {
                    "scores": {"automation": {"score": 3, "confidence": "H", "evidence": [{"kind": "file", "text": "x"}]}}
                }
            },
        )


def test_functional_assessment_rejected_on_other_relationship_types():
    with pytest.raises(ValueError, match="supported_by"):
        merge_attributes("runs_on", {}, {"functional_assessment": {"scores": {}}})


def test_nf_validation_and_apply():
    parsed = validate_nonfunctional_assessment(
        {"security": {"score": 5, "confidence": "H", "evidence": [{"kind": "link", "url": "https://example.com/soc2"}]}}
    )
    assert parsed["scores"]["security"]["score"] == 5
    props = apply_nonfunctional_assessment({"vendor": "Salesforce", "nonfunctional_assessment": parsed})
    assert props["vendor"] == "Salesforce"
    assert props["nonfunctional_assessment"]["scores"]["security"]["confidence"] == "H"
    with pytest.raises(ValueError):
        validate_functional_assessment({"scores": {"automation": {"score": 9, "confidence": "H"}}})
