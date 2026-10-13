import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("Ask and Model > Applications render the same AppAddPanel (no copy)", () => {
  const ask = src("components/mvp/AskScreen.tsx");
  const model = src("components/mvp/ModelScreen.tsx");
  assert.match(ask, /<AppAddPanel origin="ask"/);
  assert.match(model, /<AppAddPanel origin="model"/);
  for (const file of [ask, model]) {
    assert.ok(!file.includes("quick-add-chip"), "chips only in the shared panel");
    assert.ok(!file.includes("ADD_BOX_LABEL"), "label only in the shared panel");
  }
  assert.ok(!/<AddFlow origin="ask"/.test(ask), "Ask no longer renders the bare card flow");
});

test("Ask keeps its prefill and returns to Ask with the confirmation", () => {
  const ask = src("components/mvp/AskScreen.tsx");
  assert.match(ask, /initialText=\{addListText\(question\)\}/);
  assert.match(ask, /onSaved=\{rememberAdd\}/);
  assert.match(ask, /visibleReceipt \? \(\s*<AddSaved/);
});

test("the panel has every piece: label, Add apps, chips append, Ctrl+Enter, cards with x", () => {
  const panel = src("components/add/AppAddPanel.tsx");
  assert.match(panel, /\{ADD_BOX_LABEL\}/);
  assert.match(panel, /\{ADD_BOX_BUTTON\}/);
  assert.match(panel, /appendChipName\(text, name\)/);
  assert.match(panel, /isSubmitKey\(event\)/);
  assert.match(panel, /<AddFlow[\s\S]*cards[\s\S]*compact/);
  assert.match(panel, /setAddText\(initialText\)/, "a new Ask question refills the box");
  const cards = src("components/add/AddCards.tsx");
  assert.match(cards, /Where does it live\?/);
});
