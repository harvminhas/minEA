import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ADD_BOX_BUTTON, ADD_BOX_LABEL, appendChipName, canSubmitAdd, textHasName, isSubmitKey, quickAddSuggestions } from "./quick-add.ts";
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
  // The box lives in the shared AppAddPanel (Model > Applications and Ask both render it).
  const screen = src("components/add/AppAddPanel.tsx");
  assert.match(screen, /<label htmlFor=\{boxId\}/);
  assert.match(screen, /boxId = "model-add-box"/);
  assert.match(screen, /disabled=\{!canSubmitAdd\(addText, saved\)\}/);
  assert.match(screen, /boxRef\.current\?\.focus\(/);
  assert.match(screen, /scrollIntoView/);
  assert.match(screen, /ring-4/);
  assert.match(screen, /Add one with full details/);
  assert.match(screen, /submitSignal=\{submit\}/);
  assert.match(screen, /\{APP_OR_PLATFORM\}/, "keeps the Not sure? helper");
  const cards = src("components/add/AddCards.tsx");
  assert.match(cards, /rowsFor !== initialText/, "a submit waits for rows built from the submitted text");
});

test("everyday apps come before niche ones", () => {
  assert.deepEqual(quickAddSuggestions("app", [], 3), ["Slack", "Zoom Workplace", "Google Workspace"]);
  assert.equal(quickAddSuggestions("app", ["Slack", "Zoom"], 1)[0], "Google Workspace");
});

test("a chip appends like typing: separator, no overwrite, no repeat", () => {
  assert.equal(appendChipName("", "Slack"), "Slack");
  assert.equal(appendChipName("Trello", "Google Workspace"), "Trello, Google Workspace");
  assert.equal(appendChipName("Trello, ", "Slack"), "Trello, Slack");
  assert.equal(appendChipName("Trello\nAsana", "Slack"), "Trello\nAsana\nSlack");
  assert.equal(appendChipName("Trello\n", "Slack"), "Trello\nSlack");
  assert.equal(appendChipName("Trello, slack", "Slack"), "Trello, slack", "already typed: unchanged");
  assert.equal(appendChipName("zoom", "Zoom Workplace"), "zoom", "an alias counts");
  assert.equal(textHasName("Trello, Google Workspace", "Google Workspace"), true);
  assert.equal(textHasName("Trello", "Google Workspace"), false);
});

test("the chip only types; it never saves", () => {
  const screen = src("components/add/AppAddPanel.tsx");
  const at = screen.indexOf('data-testid="quick-add-chip"');
  const chip = screen.slice(at, screen.indexOf("</button>", at));
  assert.match(chip, /setAddText\(\(text\) => appendChipName\(text, name\)\)/);
  assert.match(chip, /boxRef\.current\?\.focus\(\)/);
  for (const banned of ["setSubmit", "quickAdd(", "addApi", ".save("]) assert.ok(!chip.includes(banned), `chip must not ${banned}`);
  assert.match(screen, /filter\(\(name\) => !textHasName\(addText, name\)\)/, "chips hide while named in the text");
  assert.ok(!screen.includes("quick-add-note"));
  assert.ok(!src("components/add/AddCards.tsx").includes("useQuickAdd"));
});
