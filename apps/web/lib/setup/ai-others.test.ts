import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { groupNames, othersLine } from "./ai-others";
import { planChipLabel } from "@/lib/billing/plan-chip";
import { NoAiFeaturesList } from "@/components/mvp/NoAiFeaturesList";
(globalThis as any).React = React;

test("no-AI names: A-Z, each once with a count", () => {
  const names = ["Procore", "adobe", "Zillow", "Procore", "ArcGIS Online", "procore ", "ArcGIS Online", ""];
  assert.deepEqual(groupNames(names), [
    { name: "adobe", count: 1 },
    { name: "ArcGIS Online", count: 2 },
    { name: "Procore", count: 3 },
    { name: "Zillow", count: 1 },
  ]);
  assert.equal(othersLine(126), "126 apps have no known AI features");
  assert.equal(othersLine(1), "1 app has no known AI features");
});

test("the list starts collapsed: one short line, no run-on paragraph", () => {
  const html = renderToStaticMarkup(React.createElement(NoAiFeaturesList, { names: ["Procore", "Procore", "Adobe"] }));
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /3 apps have no known AI features/);
  assert.doesNotMatch(html, /Adobe/);
  assert.equal(renderToStaticMarkup(React.createElement(NoAiFeaturesList, { names: [] })), "");
  const flow = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.match(flow, /<NoAiFeaturesList names=\{aiOthers\(drafts, aiRows\)\} \/>/);
  assert.doesNotMatch(flow, /other.*: no known AI features \(\{/);
});

test("plan chip next to the logo", () => {
  assert.equal(planChipLabel("free"), "Free");
  assert.equal(planChipLabel("starter"), "Starter");
  assert.equal(planChipLabel("business"), "Business");
  assert.equal(planChipLabel(""), null);
  assert.equal(planChipLabel("mystery"), null);
  const nav = readFileSync(new URL("../../components/nav/TopNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /data-testid="plan-chip"/);
  assert.match(nav, /planChipLabel\(org\?\.plan \?\? activeOrg\?\.plan\)/);
});
