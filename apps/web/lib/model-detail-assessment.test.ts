import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("application record assessment tab", () => {
  it("ModelDetailPanel exposes Assessment for applications and cloud services", () => {
    const panel = src("components/mvp/ModelDetailPanel.tsx");
    assert.match(panel, /showAssessment=\{showAssessment\}/);
    assert.match(panel, /ApplicationAssessmentTab/);
    assert.match(panel, /row\.object\.type === "application"/);
    assert.match(panel, /nonfunctional_assessment/);
    assert.match(panel, /rawTab === "assessment"/);
  });

  it("SystemObjectDetail still hosts Assessment for application and cloud_service records", () => {
    const detail = src("components/objects/SystemObjectDetail.tsx");
    assert.match(detail, /showAssessment=\{displaySystem\?\.type === "application"/);
    assert.match(detail, /ApplicationAssessmentTab/);
  });
});
