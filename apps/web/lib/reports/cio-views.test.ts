import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fixture from "../../../../packages/types/src/fixtures/cio-views.fixture.json";
import { idleLicences, overlaps, perLicenceCents } from "./cio-views";
import { viewsHub } from "@/lib/views-hub/hub";
import { REGISTRY } from "@/lib/fields/registry";
import type { LandscapeEdge, LandscapeObject } from "@/lib/ai/landscape";

const objects = fixture.objects as unknown as LandscapeObject[];
const relationships = fixture.relationships as unknown as LandscapeEdge[];

test("the TypeScript gives the same output as the Python mirror (shared fixture)", () => {
  assert.deepEqual(idleLicences(objects), fixture.expected.idle);
  assert.deepEqual(overlaps(objects, relationships), fixture.expected.overlaps);
});

test("cost per licence: per-user price first, else annual ÷ licences", () => {
  const perUser = { cost_lines: [{ calculation: { kind: "per_user", seats: 10, unit_price_monthly_cents: 1000 } }] };
  assert.equal(perLicenceCents(perUser, 10), 12000);
  assert.equal(perLicenceCents({ annual_cost: "1000" }, 3), 33333);
  assert.equal(perLicenceCents({}, 3), null);
});

test("hub cards use the same numbers as the views", () => {
  const cards = viewsHub({ rows: [], edges: [], objects, relationships });
  const idle = cards.find((card) => card.id === "licences")!;
  const over = cards.find((card) => card.id === "overlaps")!;
  assert.equal(idle.big, String(fixture.expected.idle.totals.idle));
  assert.equal(idle.pill, "$89,733 / yr");
  assert.equal(idle.tone, "amber");
  assert.equal(over.big, String(fixture.expected.overlaps.groups.length));
  assert.ok(over.id === "overlaps" && over.savings === "$69,160");
  const empty = viewsHub({ rows: [], edges: [], objects: [], relationships: [] });
  assert.equal(empty.find((card) => card.id === "licences")!.tone, "empty");
  assert.equal(empty.find((card) => card.id === "overlaps")!.pill, "Link capabilities");
  const notCounted = viewsHub({ rows: [], edges: [], objects: [{ id: "a", type: "application", name: "A", properties: { licence_count: 5 } }], relationships: [] });
  assert.equal(notCounted.find((card) => card.id === "licences")!.pill, "Add in use");
});

test("In use is an optional app field next to Licences", () => {
  const keys = REGISTRY.application.map((field) => field.key);
  assert.equal(keys.indexOf("licences_in_use"), keys.indexOf("licence_count") + 1);
  const field = REGISTRY.application.find((item) => item.key === "licences_in_use")!;
  assert.equal(field.label, "In use");
  assert.equal(field.editor, "number");
  assert.ok(!field.required);
});

test("views: + Add opens the app with the In use field focused; hint is collapsed", () => {
  const source = readFileSync(new URL("../../components/views/CioViews.tsx", import.meta.url), "utf8");
  assert.match(source, /modelItemPath\(basePath, "applications", id, "licences_in_use"\)/);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /Same category, no capability linked — check/);
  const screen = readFileSync(new URL("../../components/mvp/ReportDetailScreen.tsx", import.meta.url), "utf8");
  assert.match(screen, /"idle-licences"\) return <IdleLicencesReport/);
  assert.match(screen, /"overlaps"\) return <OverlapsReport/);
});
