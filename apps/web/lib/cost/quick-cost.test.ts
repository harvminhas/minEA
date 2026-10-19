import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseQuickAmount, quickCostIntent, withQuickCostLine } from "./quick-cost.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the quick cost box reads the ways people type an annual amount", () => {
  for (const [text, cents] of [
    ["1200", 120000],
    ["$1,200", 120000],
    [" 1 200 ", 120000],
    ["1200.50", 120050],
    ["1.2k", 120000],
    ["12K", 1200000],
    ["1200/yr", 120000],
    ["$4,500 per year", 450000],
    ["USD 99", 9900],
  ] as const) {
    assert.equal(parseQuickAmount(text), cents, text);
  }
  assert.equal(parseQuickAmount(""), null);
  assert.equal(parseQuickAmount("   "), null);
  for (const bad of ["lots", "0", "-5", "12abc", "$", "1.2.3"]) assert.equal(parseQuickAmount(bad), "invalid", bad);
});

test("a quick estimate is added to the record's cost lines, never replacing them", () => {
  const existing = [{ id: "old" } as never];
  const lines = withQuickCostLine(existing, { cents: 120000, vendor: "Slack", actor: "u", id: "new", now: "2026-10-19T00:00:00Z" });
  assert.equal(lines.length, 2);
  assert.equal(lines[0], existing[0]);
  assert.deepEqual(
    { ...lines[1], created_at: undefined, updated_at: undefined },
    { id: "new", type: "subscription", amount_cents: 120000, frequency: "annual", calculation: { kind: "flat" }, vendor: "Slack", source: "estimate", created_at: undefined, created_by: "u", updated_at: undefined, updated_by: "u" }
  );
  assert.equal(withQuickCostLine(null, { cents: 1, vendor: null, actor: "u", id: "x", now: "n" }).length, 1);
});

test("Enter and clicking away save, Escape cancels, other keys do nothing", () => {
  assert.equal(quickCostIntent({ type: "keydown", key: "Enter" }), "commit");
  assert.equal(quickCostIntent({ type: "blur" }), "commit");
  assert.equal(quickCostIntent({ type: "keydown", key: "Escape" }), "cancel");
  assert.equal(quickCostIntent({ type: "keydown", key: "1" }), null);
});

test("regression: the table's quick cost saves on blur, shows saving/saved/error, and is not swallowed by the row", () => {
  const cost = src("../../components/mvp/CostSection.tsx");
  const quick = cost.slice(cost.indexOf("export function QuickCostCell"), cost.indexOf("export function CostLinesEditor"));
  // Clicking away used to drop the typed amount: only the form's Enter submit saved.
  assert.match(quick, /onBlur=\{\(\) => \{\s*if \(cancelled\.current\) return;/);
  assert.match(quick, /if \(save\.isPending\) return;/);
  assert.match(quick, /Saving…/);
  assert.match(quick, /data-testid="quick-cost-saved"/);
  assert.match(quick, /role="alert"/);
  assert.match(quick, /Couldn't save: \$\{friendlyError\(err\)\}/);
  assert.match(quick, /applyCatalogWrite\(queryClient, orgSlug, workspaceSlug, \{ object: saved \}\)/);
  assert.match(quick, /withQuickCostLine\(readCostLines/);
  assert.doesNotMatch(quick, /cost_lines: \[line\]/);
  const screen = src("../../components/mvp/ModelScreen.tsx");
  assert.match(screen, /<td className="px-2 py-3" onClick=\{\(event\) => event\.stopPropagation\(\)\}>\s*<QuickCostCell row=\{row\} \/>/);
  assert.doesNotMatch(screen, /<QuickCost row=/);
  const infra = src("../../components/mvp/InfraTables.tsx");
  assert.match(infra, /<QuickCostCell row=\{row\} \/>/);
  assert.doesNotMatch(infra, /<QuickCost row=/);
});
