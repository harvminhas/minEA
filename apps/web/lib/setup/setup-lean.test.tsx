/** Lean first-run screen: step circles (current / upcoming / done), friendly progress pill, no summary cards. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { SetupProgress, Stepper } from "@/components/mvp/setup-flow";
import { setupPill } from "./setupMin";

const states = (html: string) => [...html.matchAll(/data-state="(\w+)"/g)].map((m) => m[1]);

test("step bar: one circle per step; current filled violet, upcoming outlined, done tinted with a check", () => {
  const first = renderToStaticMarkup(<Stepper step={1} />);
  assert.deepEqual(states(first), ["current", "upcoming", "upcoming", "upcoming"]);
  assert.equal((first.match(/data-testid="step-circle"/g) ?? []).length, 4);
  assert.match(first, /aria-current="step"/);
  assert.match(first, /bg-\[#5b4ce6\] text-white[^>]*>1</);
  assert.match(first, /border border-\[#c5c8d4\] bg-white text-\[#8b90a0\][^>]*>2</);
  assert.doesNotMatch(first, /✓/);

  for (const step of [2, 3, 4]) {
    const html = renderToStaticMarkup(<Stepper step={step} />);
    assert.deepEqual(states(html), [1, 2, 3, 4].map((n) => (n < step ? "done" : n === step ? "current" : "upcoming")), `step ${step}`);
    assert.equal((html.match(/>✓</g) ?? []).length, step - 1, `step ${step}: a check per done step`);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  }
});

test("compact step bar (wizard inside a card) stays at 12px so all four steps fit", () => {
  assert.match(renderToStaticMarkup(<Stepper step={3} />), /text-\[12px\] sm:text-\[13px\]/);
  const compact = renderToStaticMarkup(<Stepper step={3} compact />);
  assert.match(compact, /text-\[12px\]/);
  assert.doesNotMatch(compact, /sm:text-\[13px\]/);
});

test("step bar: labels beside the circles, connecting lines, readable by screen readers", () => {
  const html = renderToStaticMarkup(<Stepper step={3} />);
  for (const label of ["What you use", "AI turned on?", "Where each one lives", "Owners &amp; renewals"]) assert.match(html, new RegExp(label.replace("?", "\\?")));
  assert.equal((html.match(/h-px w-3/g) ?? []).length, 3, "a line between each pair of steps");
  assert.match(html, /aria-label="Setup steps"/);
  assert.match(html, /Step 1 of 4, done: /);
  assert.match(html, /Step 3 of 4, current: /);
  assert.match(html, /Step 4 of 4: /);
  assert.equal((html.match(/ \(optional\)/g) ?? []).length, 2);
  // The circles themselves are decorative.
  assert.match(html, /aria-hidden="true" data-testid="step-circle"/);
});

test("progress pill wording: apps first, then the location; correct plurals; ✓ only when done", () => {
  assert.equal(setupPill(0, 0).label, "Add at least 5 apps to see your map · 0 so far");
  assert.equal(setupPill(1, 0).label, "Add at least 5 apps to see your map · 1 so far");
  assert.equal(setupPill(4, 1).label, "Add at least 5 apps to see your map · 4 so far");
  assert.equal(setupPill(5, 0).label, "5 apps ✓ · Next, say where one of them runs");
  assert.equal(setupPill(8, 0).label, "8 apps ✓ · Next, say where one of them runs");
  assert.equal(setupPill(6, 1).label, "6 apps ✓ · Your map is ready");
  for (const n of [0, 1, 2, 4]) assert.doesNotMatch(setupPill(n, 0).label, /✓/);
  for (const [a, l] of [[0, 0], [0, 1], [3, 0], [5, 0], [9, 2]]) assert.doesNotMatch(setupPill(a, l).label, /\d+ of \d+/);
  assert.deepEqual([setupPill(0, 0).filled, setupPill(3, 0).filled, setupPill(12, 0).filled], [0, 3, 5]);
  assert.equal(setupPill(5, 0).ready, false);
  assert.equal(setupPill(5, 1).ready, true);
});

test("progress pill renders one segment per required app and a progressbar", () => {
  const html = renderToStaticMarkup(<SetupProgress apps={2} located={0} />);
  assert.equal((html.match(/h-1\.5 w-3\.5 rounded-full/g) ?? []).length, 5);
  assert.equal((html.match(/bg-\[#5b4ce6\]/g) ?? []).length, 2);
  assert.match(html, /role="progressbar"[^>]*aria-valuemax="5"[^>]*aria-valuenow="2"/);
  assert.match(html, /Add at least 5 apps to see your map · 2 so far/);
});

test("first-run screen: no summary cards, no 'most important server', cloud-friendly subtitle", () => {
  const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Paste or type a list\. About 2 minutes\.|Cloud, your own server, or not sure\.|Optional\. Fill what you know\./);
  assert.doesNotMatch(src, /most important server/);
  assert.match(src, /then show you what breaks if a key system or vendor goes down\./);
  for (const n of [1, 2, 3, 4]) assert.match(src, new RegExp(`<Stepper step=\\{${n}\\}[^>]*compact=\\{inline\\} />`));
});
