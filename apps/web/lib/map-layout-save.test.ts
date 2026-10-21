// Regression: the Model screen's full map never passed onLayoutSave, so dragged positions were lost on close.
// Every editable full map (SystemDiagramModal) must wire layout saving and reset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { savableLayout } from "./map-expand.ts";

const root = join(import.meta.dirname, "..");

test("Model panel full map saves and resets node_layout", () => {
  const src = readFileSync(join(root, "components/mvp/ModelDetailPanel.tsx"), "utf8");
  const modal = src.slice(src.indexOf("<SystemDiagramModal"), src.indexOf("/>", src.indexOf("<SystemDiagramModal")));
  assert.match(modal, /onLayoutSave=/);
  assert.match(modal, /onResetLayout=/);
  assert.match(src, /properties: \{ node_layout: layout \}/);
});

test("revealed and +N more nodes are never persisted", () => {
  const p = { x: 1, y: 2 };
  assert.deepEqual(Object.keys(savableLayout({ "system-center": p, "link-A-outbound": p, "x-B": p, "more-A": p })), ["system-center", "link-A-outbound"]);
});
