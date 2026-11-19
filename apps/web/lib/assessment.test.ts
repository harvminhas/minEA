import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeAppProcessCoverage,
  computeCoverage,
  coverageScoreFromPercent,
  displayFitness,
  fitnessFromScores,
  functionalDescriptors,
  nonfunctionalDescriptors,
  parseFunctionalAssessment,
  parseNonfunctionalAssessment,
  validateFunctionalAssessment,
  validateNonfunctionalAssessment,
  weakestScore,
} from "@minea/types";

test("every functional and non-functional dimension has concise 1–5 anchors", () => {
  const functional = functionalDescriptors();
  const nonfunctional = nonfunctionalDescriptors();
  assert.equal(functional.length, 6);
  assert.equal(nonfunctional.length, 8);
  for (const item of [...functional, ...nonfunctional]) {
    assert.ok(item.label);
    for (const score of [1, 2, 3, 4, 5] as const) {
      const text = item.anchors[score];
      assert.ok(text && text.length > 20 && text.length < 160, `${item.key} ${score}: ${text}`);
    }
  }
});

test("coverage bands and weakest-score roll-up / fitness derivation", () => {
  assert.equal(coverageScoreFromPercent(0), 1);
  assert.equal(coverageScoreFromPercent(24), 1);
  assert.equal(coverageScoreFromPercent(25), 2);
  assert.equal(coverageScoreFromPercent(50), 3);
  assert.equal(coverageScoreFromPercent(70), 4);
  assert.equal(coverageScoreFromPercent(90), 5);
  assert.equal(coverageScoreFromPercent(100), 5);
  assert.equal(computeCoverage(3, 4)?.score, 4);
  assert.equal(weakestScore([5, 4, 2]), 2);
  assert.equal(fitnessFromScores([5, 4]), "strong");
  assert.equal(fitnessFromScores([5, 3]), "adequate");
  assert.equal(fitnessFromScores([4, 2]), "weak");
  assert.equal(fitnessFromScores([]), null);
});

test("fitness is derived from scores when present, otherwise the stored value", () => {
  assert.equal(displayFitness({ fitness: "strong" }), "strong");
  assert.equal(
    displayFitness({
      fitness: "strong",
      functional_assessment: { scores: { automation: { score: 2, confidence: "H", evidence: [] } } },
    }),
    "weak",
  );
  assert.equal(displayFitness({}), null);
});

test("process-step coverage counts stages in processes that mention the activity", () => {
  const processes = [
    {
      stages: [
        { capability_ids: ["capture"] },
        { capability_ids: ["capture"] },
        { capability_ids: ["capture"] },
        { capability_ids: ["qualify"] },
      ],
    },
  ];
  const edges = [
    { type: "supported_by", from_object_id: "capture", to_object_id: "leadpad" },
    { type: "supported_by", from_object_id: "qualify", to_object_id: "salesforce" },
    { type: "supported_by", from_object_id: "capture", to_object_id: "salesforce" },
  ];
  const leadpad = computeAppProcessCoverage("leadpad", "capture", processes, edges);
  const salesforce = computeAppProcessCoverage("salesforce", "capture", processes, edges);
  assert.equal(leadpad?.total, 4);
  assert.equal(leadpad?.supported, 3);
  assert.equal(leadpad?.score, 4);
  assert.equal(salesforce?.supported, 4);
  assert.equal(salesforce?.score, 5);
  assert.equal(computeAppProcessCoverage("leadpad", "other", processes, edges), null);
});

test("validation accepts notes and links and rejects files or bad scores", () => {
  const ok = validateFunctionalAssessment({
    scores: {
      automation: {
        score: 2,
        confidence: "M",
        evidence: [
          { kind: "note", text: "Manual re-key" },
          { kind: "link", url: "https://example.com/ticket" },
        ],
      },
    },
    gaps: ["Canada consent on the same screen"],
    regional_scope: "both",
  });
  assert.equal(ok?.scores.automation?.score, 2);
  assert.equal(ok?.regional_scope, "both");
  assert.throws(() => validateFunctionalAssessment({ scores: { automation: { score: 6, confidence: "H" } } }));
  assert.throws(() =>
    validateFunctionalAssessment({
      scores: { automation: { score: 2, confidence: "H", evidence: [{ kind: "file", text: "x" }] } },
    }),
  );
  const nf = validateNonfunctionalAssessment({
    security: { score: 5, confidence: "H", evidence: [{ kind: "link", url: "https://example.com/soc2" }] },
  });
  assert.equal(nf?.scores.security?.score, 5);
  const parsed = parseFunctionalAssessment({
    automation: { score: "2", confidence: "m", evidence: [{ kind: "note", text: "n" }] },
  });
  assert.equal(parsed?.scores.automation?.score, 2);
  assert.equal(parseNonfunctionalAssessment({ scores: { cost: { score: 3, confidence: "L" } } })?.scores.cost?.score, 3);
});
