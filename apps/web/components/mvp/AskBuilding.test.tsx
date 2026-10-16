import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskBuildingView, buildingView, rowsHinted } from "./AskBuilding";
import type { AskStep } from "@/lib/api-client";

const estate: AskStep = { id: "estate", status: "done", label: "Read your estate: 18 Applications and 2 SaaS platforms", counts: { items: 20 } };
const lookup: AskStep = { id: "tool-1", status: "done", label: "Found 1 Salesforce item", counts: { total: 1 }, tool: "filter_records" };
const check: AskStep = { id: "check-1", status: "done", label: "Checked every name and number against the lookups" };
const view = (steps: AskStep[], extra: Partial<Parameters<typeof buildingView>[0]> = {}) => buildingView({ steps, streaming: true, elapsedMs: 2000, quietMs: 500, estateCount: 20, ...extra });
const html = (v: ReturnType<typeof buildingView>) => renderToStaticMarkup(<AskBuildingView view={v} />);

test("live table flow: real events tick in, a running step names what's next, rows appear once a lookup found items", () => {
  const first = view([]);
  assert.deepEqual(first.steps.map((s) => [s.label, s.status]), [["Reading 20 items in your workspace…", "running"]]);
  assert.equal(first.tableRows, 0);
  const afterEstate = view([estate]);
  assert.deepEqual(afterEstate.steps.map((s) => [s.label, s.status]), [["Read 20 items", "done"], ["Asking the AI…", "running"]]);
  assert.equal(afterEstate.tableRows, 0);
  assert.doesNotMatch(html(afterEstate), /ask-skel-table/);
  const afterLookup = view([estate, lookup]);
  assert.equal(afterLookup.tableRows, 1);
  assert.equal(afterLookup.steps.at(-1)!.label, "Looking at the results…");
  assert.equal(afterLookup.status, "1 lookup done");
  const out = html(afterLookup);
  assert.match(out, /ask-skel-table/);
  assert.equal(out.match(/data-testid="ask-skel-row"/g)!.length, 1);
  const writing = view([estate, lookup, check]);
  assert.equal(writing.steps.at(-1)!.label, "Writing the answer…");
  assert.equal(writing.status, "Writing the answer…");
});

test("no-table flow: prose/number answers keep the headline bar + text lines only", () => {
  const counted: AskStep = { id: "tool-1", status: "done", label: "Counted spend", tool: "aggregate" };
  const v = view([estate, counted]);
  assert.equal(v.tableRows, 0);
  const out = html(v);
  assert.match(out, /ask-skel-headline/);
  assert.match(out, /ask-skel-lines/);
  assert.doesNotMatch(out, /ask-skel-table|ask-skel-row/);
});

test("heartbeat: a quiet stream still says it's working", () => {
  assert.match(view([estate], { quietMs: 7000 }).steps.at(-1)!.label, /Still working/);
});

test("errors show as error steps; zero-count lookups add no rows", () => {
  const failed: AskStep = { id: "tool-1", status: "error", label: "A lookup failed", tool: "x" };
  assert.equal(view([estate, failed]).steps[1].status, "error");
  assert.equal(rowsHinted([estate, { ...lookup, counts: { total: 0 } }]), 0);
  assert.equal(rowsHinted([estate, { ...lookup, counts: { total: 40 } }]), 5);
});

test("non-streaming fallback: same skeleton, generic progression", () => {
  const at = (ms: number) => buildingView({ steps: [], streaming: false, elapsedMs: ms, quietMs: ms, estateCount: 20 });
  assert.deepEqual(at(200).steps.map((s) => s.label), ["Reading 20 items in your workspace…"]);
  assert.deepEqual(at(2000).steps.map((s) => [s.label, s.status]), [["Read 20 items", "done"], ["Asking the AI…", "running"]]);
  assert.deepEqual(at(5000).steps.map((s) => s.status), ["done", "done", "running"]);
  assert.equal(at(5000).tableRows, 0);
  assert.match(html(at(5000)), /ask-skel-headline/);
});

test("animations respect prefers-reduced-motion", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const block = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const cls of ["ask-shimmer", "ask-spin", "ask-word", "ask-row-in", "ask-owl-eyes"]) assert.match(block, new RegExp(`\\.${cls}`));
});
