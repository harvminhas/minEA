import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cameFromViews, withFromViews } from "./routes.ts";

const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("hub report links carry from=views; the flag is read back", () => {
  assert.equal(withFromViews("/b/reports/hosting"), "/b/reports/hosting?from=views");
  assert.equal(withFromViews("/b/reports/x?y=1"), "/b/reports/x?y=1&from=views");
  assert.equal(cameFromViews(new URLSearchParams("from=views")), true);
  assert.equal(cameFromViews(new URLSearchParams("")), false);
  assert.equal(cameFromViews(null), false);
  assert.match(src("components/views/ViewsHub.tsx"), /withFromViews\(reportPath\(basePath, open\.reportId\)\)/);
});

test("/views/impact: Back to Views always, and no Estate map link to the old view", () => {
  const views = src("components/mvp/EstateViews.tsx");
  assert.match(views, /<BackToViews \/>/);
  assert.doesNotMatch(views, /Estate map/);
  assert.doesNotMatch(views, /views\/foundations/);
  // The legacy page itself stays.
  assert.ok(readFileSync(new URL("../../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/foundations/page.tsx", import.meta.url)));
});

test("reports show Back to Views only when opened from the hub, else the Reports link", () => {
  for (const file of ["components/mvp/ReportDetailScreen.tsx", "components/mvp/AiLandscapeReport.tsx"]) {
    const text = src(file);
    assert.match(text, /cameFromViews\(useSearchParams\(\)\)/, file);
    assert.match(text, /fromViews \? \(\s*<BackToViews/, file);
    assert.match(text, /href=\{reportsPath\(basePath\)\}/, file);
  }
});
