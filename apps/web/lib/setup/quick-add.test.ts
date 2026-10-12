import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ADD_BOX_BUTTON, ADD_BOX_LABEL, canSubmitAdd, isSubmitKey, quickAddSuggestions } from "./quick-add.ts";
import { TOOL_CATALOG } from "../catalog/tools-catalog.ts";
import { prepareRows, type EstateItem } from "./add-plan.ts";

const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const item = (name: string): EstateItem => ({ id: name, type: "application", name, owner: "", cost: "", lifecycle: "", category: "", catalogTool: "", vendor: "", renewal: "" });

test("quick-add offers 3-5 catalog apps the workspace doesn't have", () => {
  const none = quickAddSuggestions("app", []);
  assert.ok(none.length >= 3 && none.length <= 5);
  const apps = new Set(TOOL_CATALOG.filter((tool) => tool.kind === "app").map((tool) => tool.name));
  for (const name of none) assert.ok(apps.has(name), `${name} is a catalog app`);
  const some = quickAddSuggestions("app", ["Salesforce", "zoom", "QuickBooks"]);
  assert.ok(!some.includes("Salesforce"));
  assert.ok(!some.includes("Zoom Workplace"), "an alias counts as already there");
  assert.ok(!some.includes("QuickBooks Online"));
  assert.ok(some.length >= 3);
  assert.equal(new Set(some).size, some.length);
});

test("Ctrl/Cmd+Enter submits, plain Enter is a new line, empty text can't submit", () => {
  assert.equal(isSubmitKey({ key: "Enter", ctrlKey: true }), true);
  assert.equal(isSubmitKey({ key: "Enter", metaKey: true }), true);
  assert.equal(isSubmitKey({ key: "Enter" }), false);
  assert.equal(isSubmitKey({ key: "Enter", ctrlKey: true, nativeEvent: { isComposing: true } }), false);
  assert.equal(canSubmitAdd("   \n", false), false);
  assert.equal(canSubmitAdd("Slack", false), true);
  assert.equal(canSubmitAdd("Slack", true), false, "no double save of the same text");
});

test("the box path doesn't duplicate: repeats collapse, existing records are kept", () => {
  assert.equal(prepareRows("Slack, slack\nSlack", "app", []).length, 1);
  const rows = prepareRows("HubSpot\nSlack", "app", [item("HubSpot")]);
  assert.equal(rows.find((row) => row.name === "HubSpot")?.existing?.id, "HubSpot");
  assert.equal(rows.find((row) => row.name === "Slack")?.existing, null);
});

test("the Applications add box has a label, an Add apps button, chips, focus + highlight", () => {
  assert.match(ADD_BOX_LABEL, /^Add applications: type the names, separated by commas or new lines/);
  assert.equal(ADD_BOX_BUTTON, "Add apps");
  const screen = src("components/mvp/ModelScreen.tsx");
  assert.match(screen, /<label htmlFor="model-add-box"/);
  assert.match(screen, /disabled=\{!canSubmitAdd\(addText, addSaved\)\}/);
  assert.match(screen, /box\.focus\(/);
  assert.match(screen, /scrollIntoView/);
  assert.match(screen, /ring-4/);
  assert.match(screen, /Add one with full details/);
  assert.match(screen, /submitSignal=\{addSubmit\}/);
  assert.match(screen, /\{APP_OR_PLATFORM\}/, "keeps the Not sure? helper");
  const cards = src("components/add/AddCards.tsx");
  assert.match(cards, /rowsFor !== initialText/, "a submit waits for rows built from the submitted text");
});

test("everyday apps come before niche ones", () => {
  assert.deepEqual(quickAddSuggestions("app", [], 3), ["Slack", "Zoom Workplace", "Google Workspace"]);
  assert.equal(quickAddSuggestions("app", ["Slack", "Zoom"], 1)[0], "Google Workspace");
});

test("a chip saves only its own product, deduped, and never the typed box", async () => {
  const { quickAddBatch } = await import("./quick-add.ts");
  const batch = quickAddBatch("Google Workspace", [item("Slack")]);
  assert.deepEqual(batch?.creates.map((c) => c.name), ["Google Workspace"]);
  assert.equal(batch?.updates.length, 0);
  assert.equal(quickAddBatch("Slack", [item("Slack")]), null, "already there: nothing saved");
  const screen = src("components/mvp/ModelScreen.tsx");
  const chip = screen.slice(screen.indexOf('data-testid="quick-add-chip"'), screen.indexOf("</button>", screen.indexOf('data-testid="quick-add-chip"')));
  assert.match(chip, /quickAdd\(name\)/);
  for (const banned of ["setAddText", "setAddSubmit", "setAddSaved", "setAddKindLocked"]) assert.ok(!chip.includes(banned), `chip must not call ${banned}`);
});
