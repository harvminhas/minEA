/** Setup wizard fixes: step 2 after a cards save, owners step that fits, honest step-2 state when opened at step 3. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { QueryClient } from "@tanstack/react-query";
import { Stepper, latestCatalog } from "@/components/mvp/setup-flow";
import { aiStepRows } from "./add-plan";
import { applyCatalogWrite, catalogQueryKey } from "../use-model-catalog";

const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
const at = "2026-10-17T12:00:00Z";
const app = (id: string, name: string, properties: Record<string, unknown> = {}) =>
  ({ id, type: "application", name, properties, description: "", tags: [], status: null, created_at: at, updated_at: at }) as never;
const states = (html: string) => [...html.matchAll(/data-state="(\w+)"/g)].map((m) => m[1]);

test("bug 1: apps the cards just saved are found (fresh query cache, not the pre-save render copy)", () => {
  const client = new QueryClient();
  const key = catalogQueryKey("northwind", "main");
  const rendered = { objects: [], relationships: [] }; // what catalog.data held when the handler was created
  client.setQueryData(key, { objects: [], relationships: [], rows: [] });
  // The add panel saves Salesforce and writes it into the cached catalogue, then calls onSaved straight away.
  applyCatalogWrite(client, "northwind", "main", { object: app("o1", "Salesforce", { catalog_tool: "salesforce", vendor: "Salesforce" }) });
  const fresh = latestCatalog(client, key, rendered);
  assert.deepEqual(fresh.objects.map((o) => o.id), ["o1"], "the stale copy would have had none");
  assert.equal(latestCatalog(client, null, { objects: [app("x", "X")] }).objects.length, 1, "falls back to the render copy without a key");
  // ...and that saved app does have AI questions, so step 2 must open.
  const rows = aiStepRows(fresh.objects.map((o) => ({ key: "salesforce", objectId: o.id, type: o.type, name: o.name, properties: o.properties }))).rows;
  assert.ok(rows.length > 0);
});

test("bug 1: createApps, cardDrafts and goWhere all read the fresh catalogue", () => {
  const create = src.slice(src.indexOf("const createApps"), src.indexOf("const aiSave"));
  assert.match(create, /const savedObjects = freshCatalog\(\)\.objects;/);
  assert.match(create, /savedObjects\.find\(\(object\) => object\.id === draft\.objectId\)/);
  assert.doesNotMatch(create, /catalog\.data\?\.objects\.find/);
  assert.match(src.slice(src.indexOf("const cardDrafts"), src.indexOf("const next = ")), /freshCatalog\(\)\.objects/);
  assert.match(src.slice(src.indexOf("const goWhere"), src.indexOf("const createApps")), /const current = freshCatalog\(\);/);
});

test("bug 2: owners step is labelled blocks that wrap (no wide table, no sideways scroll)", () => {
  const step4 = src.slice(src.indexOf("{step === 4 && ("), src.indexOf("{error && <p"));
  assert.doesNotMatch(step4, /<table|overflow-x-auto|min-w-\[8rem\]/);
  assert.match(step4, /data-testid="owners-list"/);
  assert.match(step4, /grid grid-cols-2 gap-x-2 gap-y-1\.5 \$\{inline \? "sm:grid-cols-3" : "sm:grid-cols-5"\}/);
  for (const label of ["Owner team", "Named owner", "Renewal", "Licences", "Yearly cost"]) assert.match(step4, new RegExp(`label="${label}"`));
  // Inputs shrink with their column instead of forcing the row wider.
  assert.match(src, /className=\{`mt-0\.5 block h-8 w-full min-w-0 rounded-lg border/);
});

test("bug 3: opened straight at step 3 with AI still to answer, step 2 shows as not done", () => {
  const html = renderToStaticMarkup(<Stepper step={3} aiStep="todo" />);
  assert.deepEqual(states(html), ["done", "upcoming", "current", "upcoming"]);
  assert.match(html, /border border-\[#c5c8d4\] bg-white text-\[#8b90a0\][^>]*>2</, "number in the upcoming style");
  assert.equal((html.match(/>✓</g) ?? []).length, 1, "only step 1 is checked");
  assert.match(html, /Step 2 of 4, not answered yet: /);
  // Still not done on step 4.
  assert.deepEqual(states(renderToStaticMarkup(<Stepper step={4} aiStep="todo" />)), ["done", "upcoming", "done", "current"]);
});

test("bug 3: nothing to ask counts as done (✓) and says why; a visited step 2 is plain done", () => {
  const none = renderToStaticMarkup(<Stepper step={3} aiStep="none" />);
  assert.deepEqual(states(none), ["done", "done", "current", "upcoming"]);
  assert.match(none, /Step 2 of 4, nothing to ask: /);
  assert.match(none, /title="Nothing to ask: none of your apps have known AI features"/);
  const visited = renderToStaticMarkup(<Stepper step={3} />);
  assert.deepEqual(states(visited), ["done", "done", "current", "upcoming"]);
  assert.match(visited, /Step 2 of 4, done: /);
  assert.doesNotMatch(visited, /title=/);
});

test("bug 3: the wizard sets step 2's state from what actually happened", () => {
  const seed = src.slice(src.indexOf('if (startAt !== "where" || seeded'), src.indexOf("}, [startAt, seeded, catalog.data]);"));
  assert.match(seed, /setAiStep\(aiStepRows\([\s\S]*\)\.rows\.length > 0 \? "todo" : "none"\)/);
  const create = src.slice(src.indexOf("const createApps"), src.indexOf("const aiSave"));
  assert.match(create, /setAiStep\(rows\.length > 0 \? "done" : "none"\);/);
  assert.match(src, /<Stepper step=\{3\} aiStep=\{aiStep\} compact=\{inline\} \/>/);
  assert.match(src, /<Stepper step=\{4\} aiStep=\{aiStep\} whereSkipped=\{whereSkipped\} compact=\{inline\} \/>/);
  // Opened at step 3 on a workspace whose apps have AI features -> "todo"; plain custom apps -> "none".
  assert.ok(aiStepRows([{ key: "a", objectId: "a", type: "application", name: "Microsoft 365", properties: {} }]).rows.length > 0);
  assert.equal(aiStepRows([{ key: "b", objectId: "b", type: "application", name: "Payroll Portal", properties: {} }]).rows.length, 0);
});
