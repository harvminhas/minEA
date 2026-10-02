import assert from "node:assert/strict";
import { test } from "node:test";
import { askShortcut, stripSplitUrl } from "./ask-shortcut.ts";

const base = "/orgs/acme/workspaces/default";

test("Ctrl K on Ask focuses the bar", () => {
  assert.deepEqual(askShortcut({ metaKey: false, ctrlKey: true, key: "k" }, `${base}/ask`, base), { type: "focus" });
  assert.deepEqual(askShortcut({ metaKey: true, ctrlKey: false, key: "K" }, `${base}/ask/answer`, base), { type: "focus" });
});

test("Ctrl K on Model or Reports opens Ask and asks the bar to focus", () => {
  assert.deepEqual(
    askShortcut({ metaKey: false, ctrlKey: true, key: "k" }, `${base}/model/overview`, base),
    { type: "navigate", href: `${base}/ask?focus=ask` }
  );
  assert.deepEqual(
    askShortcut({ metaKey: true, ctrlKey: false, key: "k" }, `${base}/reports`, base),
    { type: "navigate", href: `${base}/ask?focus=ask` }
  );
});

test("a plain K is not the shortcut", () => {
  assert.equal(askShortcut({ metaKey: false, ctrlKey: false, key: "k" }, `${base}/model/overview`, base), null);
});

test("old split URLs drop the split flag and keep the rest", () => {
  assert.equal(stripSplitUrl(`${base}/model/servers`, "?split=1"), `${base}/model/servers`);
  assert.equal(stripSplitUrl(`${base}/views`, "?tab=impact&split=1"), `${base}/views?tab=impact`);
  assert.equal(stripSplitUrl(`${base}/split`, ""), base);
  assert.equal(stripSplitUrl(`${base}/ask`, ""), null);
});
