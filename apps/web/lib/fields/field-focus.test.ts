import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLASH_MS, fieldKeyForGap, flashField, openRecordField } from "./field-focus.ts";
import { REGISTRY, recordTypeOf } from "./registry.ts";
import { modelItemPath } from "../mvp-paths.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every table + Add gap points at a real detail field for each record kind", () => {
  assert.equal(fieldKeyForGap("application", "owner"), "owner");
  assert.equal(fieldKeyForGap("application", "vendor"), "vendor");
  assert.equal(fieldKeyForGap("application", "renewal"), "contract_renewal");
  assert.equal(fieldKeyForGap("application", "lifecycle"), "status");
  assert.equal(fieldKeyForGap("application", "criticality"), "criticality");
  assert.equal(fieldKeyForGap("model", "renewal"), "commitment_ends");
  assert.equal(fieldKeyForGap("model", "owner"), "owner");
  assert.equal(fieldKeyForGap("cloud_service", "owner"), "owner");
  assert.equal(fieldKeyForGap("cloud_service", "lifecycle"), "lifecycle");
  for (const type of ["application", "solution", "model", "cloud_service"]) {
    for (const gap of ["owner", "vendor", "cost", "renewal", "lifecycle", "criticality"] as const) {
      const key = fieldKeyForGap(type, gap);
      assert.ok(key, `${type} ${gap}`);
      assert.ok(REGISTRY[recordTypeOf(type)!].some((def) => def.key === key));
    }
  }
  assert.equal(fieldKeyForGap("not_a_record", "owner"), null);
});

test("record links carry ?focus= only when a field is asked for", () => {
  assert.equal(modelItemPath("/o/w", "applications", "a b"), "/o/w/model/applications/a%20b");
  assert.equal(modelItemPath("/o/w", "applications", "a", "contract_renewal"), "/o/w/model/applications/a?focus=contract_renewal");
  assert.equal(modelItemPath("/o/w", "servers", "a", null), "/o/w/model/servers/a");
});

test("+ Add on the field already in the URL flashes it again instead of a no-op push", () => {
  const events: string[] = [];
  const pushed: string[] = [];
  const g = globalThis as any;
  const saved = { window: g.window, CustomEvent: g.CustomEvent };
  g.window = { location: { pathname: "/o/w/model/applications/a", search: "?focus=owner", origin: "http://x" }, dispatchEvent: (e: any) => events.push(e.detail) };
  g.CustomEvent = class { detail: unknown; constructor(_: string, init: { detail: unknown }) { this.detail = init.detail; } };
  try {
    openRecordField("/o/w/model/applications/a?focus=owner", (h) => pushed.push(h));
    openRecordField("/o/w/model/applications/a?focus=criticality", (h) => pushed.push(h));
  } finally {
    g.window = saved.window;
    g.CustomEvent = saved.CustomEvent;
  }
  assert.deepEqual(events, ["owner"]);
  assert.deepEqual(pushed, ["/o/w/model/applications/a?focus=criticality"]);
});

function fakeTimers() {
  const queue: { fn: () => void; ms: number; id: number }[] = [];
  let id = 0;
  return {
    setTimer: (fn: () => void, ms: number) => (queue.push({ fn, ms, id: ++id }), id),
    clearTimer: (cid: number) => { const i = queue.findIndex((t) => t.id === cid); if (i >= 0) queue.splice(i, 1); },
    runAll: () => queue.sort((a, b) => a.ms - b.ms).splice(0).forEach((t) => t.fn()),
    queue,
  };
}
const el = () => ({ style: { boxShadow: "", backgroundColor: "", transition: "", borderRadius: "" } });

test("the highlight is an amber ring that fades over ~1.5s and then clears", () => {
  const t = fakeTimers();
  const target = el();
  flashField(target, { reducedMotion: false, setTimer: t.setTimer, clearTimer: t.clearTimer });
  assert.match(target.style.boxShadow, /245, 158, 11, 0\.55/);
  assert.equal(target.style.transition, "");
  assert.ok(t.queue.some((x) => x.ms === 300) && Math.max(...t.queue.map((x) => x.ms)) <= FLASH_MS + 100);
  t.queue.find((x) => x.ms === 300)!.fn();
  assert.match(target.style.transition, /box-shadow 1200ms ease-out/);
  t.runAll();
  assert.deepEqual(target.style, { boxShadow: "", backgroundColor: "", transition: "", borderRadius: "8px" });
  assert.equal(FLASH_MS, 1500);
});

test("with reduced motion the highlight shows and goes without any transition", () => {
  const t = fakeTimers();
  const target = el();
  const cancel = flashField(target, { reducedMotion: true, setTimer: t.setTimer, clearTimer: t.clearTimer });
  assert.equal(t.queue.length, 1);
  assert.equal(t.queue[0].ms, FLASH_MS);
  assert.equal(target.style.transition, "");
  cancel();
  assert.equal(t.queue.length, 0);
  assert.equal(target.style.boxShadow, "");
});

test("every + Add column in the record tables opens the record at its field", () => {
  const screen = src("../../components/mvp/ModelScreen.tsx");
  assert.doesNotMatch(screen, /<AddChip label="Add" onClick=\{\(\) => open\(row\)\}/);
  for (const gap of ["owner", "vendor", "renewal", "lifecycle", "criticality"]) {
    assert.match(screen, new RegExp(`<AddChip label="Add" onClick=\\{\\(\\) => openAt\\(row, "${gap}"\\)\\}`));
  }
  const infra = src("../../components/mvp/InfraTables.tsx");
  assert.equal((infra.match(/openRecordField\(modelItemPath\(basePath, "(platforms|servers)", row\.id, fieldKeyForGap\(row\.object\.type, "owner"\)\)/g) ?? []).length, 2);
  assert.doesNotMatch(infra, /<AddChip label="Add" onClick=\{\(\) => router\.push\(modelItemPath\(basePath, "\w+", row\.id\)\)\}/);
});

test("a focused field unfolds its section for the visit without changing the saved fold", () => {
  const editors = src("../../components/mvp/InfraEditors.tsx");
  assert.match(editors, /const open = !collapsed\.has\(group\.section\) \|\| revealed\.has\(group\.section\) \|\| group\.section === openSection;/);
  // Revealing only touches local state; the stored preference changes only from a header click.
  assert.equal((editors.match(/setCollapsed\(/g) ?? []).length, 1);
  assert.match(editors, /forceOpen=\{openKey === def\.key\}/);
  const panel = src("../../components/mvp/ModelDetailPanel.tsx");
  assert.match(panel, /flashField\(target, \{ reducedMotion \}\)/);
  assert.match(panel, /behavior: reducedMotion \? "auto" : "smooth"/);
  assert.match(panel, /FOCUS_FIELD_EVENT/);
});
