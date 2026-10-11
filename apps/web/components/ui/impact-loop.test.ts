import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IMPACT_EXAMPLES, IMPACT_LOOP_MS, ImpactLoop, impactCaption, impactedProcesses } from "./ImpactLoop.tsx";
import { StartupLoader, STARTUP_SHELL_STEPS } from "./StartupLoader.tsx";

(globalThis as any).React = React;

test("captions rotate across 3 examples with the right counts", () => {
  assert.equal(IMPACT_LOOP_MS, 2400);
  assert.deepEqual(IMPACT_EXAMPLES.map(impactCaption), [
    "If Database goes down → 3 apps, 3 processes affected",
    "If Single sign-on goes down → 2 apps, 2 processes affected",
    "If Payments API goes down → 1 app, 1 process affected",
  ]);
  assert.deepEqual(impactedProcesses(IMPACT_EXAMPLES[2]!), ["invoicing"]);
});

test("diagram: source, 3 apps, 3 processes, outage lines only on affected paths", () => {
  const html = renderToStaticMarkup(React.createElement(ImpactLoop, { exampleIndex: 0 }));
  for (const label of ["Database", "CRM", "Billing", "Order Entry", "Sales", "Invoicing", "Shipping", "down"]) {
    assert.match(html, new RegExp(`>${label}<`), label);
  }
  assert.match(html, /viewBox="0 0 260 160"/);
  assert.equal((html.match(/bm-impact-flow /g) ?? []).length, 6);
  assert.equal((html.match(/bm-impact-hit-1/g) ?? []).length, 3);
  assert.equal((html.match(/bm-impact-hit-2/g) ?? []).length, 3);
  const sso = renderToStaticMarkup(React.createElement(ImpactLoop, { exampleIndex: 1 }));
  assert.equal((sso.match(/bm-impact-flow /g) ?? []).length, 4);
  assert.match(sso, />SSO</);
  assert.match(sso, /2 apps, 2 processes affected/);
});

test("loading screen keeps owl + wordmark above, status and shimmer below the diagram", () => {
  const html = renderToStaticMarkup(React.createElement(StartupLoader, { stepIndex: 0, steps: STARTUP_SHELL_STEPS }));
  const order = ["bm-owl-blink", ">BuboMap<", "impact-loop", "Loading your organisation…", "bm-shimmer"].map((s) => html.indexOf(s));
  assert.ok(order.every((i) => i >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("css: 2.4 s keyframes and a static impact frame under reduced motion", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.bm-impact-flow-1 \{ animation: bm-imp-flow-1 2\.4s/);
  const reduced = css.slice(css.indexOf("/* One static \"impact\" frame. */") - 60);
  assert.match(reduced, /\.bm-impact \* \{ animation: none !important; \}/);
  assert.match(reduced, /\.bm-impact \.is-hit rect \{ fill: #fee2e2; stroke: #ef4444; \}/);
});
