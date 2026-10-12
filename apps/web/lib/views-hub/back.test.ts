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

test("reports from the hub hide the Reports sidebar; direct reports keep it", async () => {
  const { showReportsSidebar } = await import("./routes.ts");
  const path = "/orgs/o/workspaces/w/reports/single-points";
  assert.equal(showReportsSidebar(path, new URLSearchParams("from=views")), false);
  assert.equal(showReportsSidebar(path, new URLSearchParams("")), true);
  assert.equal(showReportsSidebar("/orgs/o/workspaces/w/reports", null), true);
  assert.equal(showReportsSidebar("/orgs/o/workspaces/w/ask", new URLSearchParams("from=views")), false);
  const frame = src("components/mvp/MvpFrame.tsx");
  assert.match(frame, /\{!fromViews && <ReportsSidebar \/>\}/);
  assert.match(frame, /max-w-\[1180px\]/);
});
