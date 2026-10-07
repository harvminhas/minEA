import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_FEATURE_CATALOG } from "@minea/types";
import { lineAnnualCents } from "../cost/math.ts";
import { catalogEntriesFor } from "./catalog.ts";
import { confirmFeature, readFeatures, removeFeature, setFeatureSeats, suggestedFeatures } from "./features.ts";

const NOW = "2026-10-07T12:00:00.000Z";
const entry = (key: string) => AI_FEATURE_CATALOG.find((item) => item.key === key)!;
const host = (name: string, properties: Record<string, unknown> = {}, type = "application", status: string | null = "active") => ({
  type,
  name,
  status,
  properties,
});
const keys = (items: { key: string }[]) => items.map((item) => item.key).sort();

test("the seed catalog has 16 entries with unique keys", () => {
  assert.equal(AI_FEATURE_CATALOG.length, 16);
  assert.equal(new Set(AI_FEATURE_CATALOG.map((item) => item.key)).size, 16);
});

test("Microsoft 365 suggests 3 entries; retired hosts, servers and look-alike names suggest none", () => {
  assert.deepEqual(keys(suggestedFeatures(host("Microsoft 365"))), ["m365-copilot", "m365-copilot-chat", "teams-premium-recap"]);
  assert.deepEqual(keys(suggestedFeatures(host("Office 365 E3"))), ["m365-copilot", "m365-copilot-chat", "teams-premium-recap"]);
  assert.deepEqual(suggestedFeatures(host("Microsoft 365", {}, "application", "retired")), []);
  assert.deepEqual(suggestedFeatures(host("Microsoft 365", { lifecycle: "end_of_life" }, "cloud_service")), []);
  assert.deepEqual(suggestedFeatures(host("Microsoft 365", {}, "model")), []);
  assert.deepEqual(suggestedFeatures(host("Slackware")), []);
});

test("a Zoom object with catalog_tool suggests AI Companion (raw or normalized tool name)", () => {
  assert.deepEqual(keys(catalogEntriesFor(host("Video calls", { catalog_tool: "Zoom Workplace" }))), ["zoom-ai-companion"]);
  assert.deepEqual(keys(catalogEntriesFor(host("Video calls", { catalog_tool: "zoom workplace" }))), ["zoom-ai-companion"]);
  assert.deepEqual(keys(catalogEntriesFor(host("Zendesk", {}, "cloud_service"))), ["zendesk-ai-agents", "zendesk-copilot"]);
});

test("confirm stores the catalog defaults and who confirmed it; stored keys leave the suggestions", () => {
  const object = host("Microsoft 365");
  const patch = confirmFeature(object, entry("m365-copilot"), "piloting", "Ana Silva", NOW);
  assert.deepEqual(patch.properties.ai_features, [
    {
      key: "m365-copilot",
      name: "Microsoft 365 Copilot",
      status: "piloting",
      audience: "some_groups",
      sees_company_data: "yes",
      vendor_trains: "no",
      source: "catalog",
      confirmed_at: NOW,
      confirmed_by: "Ana Silva",
    },
  ]);
  const saved = host("Microsoft 365", patch.properties);
  assert.deepEqual(keys(suggestedFeatures(saved)), ["m365-copilot-chat", "teams-premium-recap"]);
  const again = confirmFeature(saved, entry("m365-copilot"), "on", "Ben Ode", NOW);
  assert.equal(again.properties.ai_features.length, 1);
  assert.equal(again.properties.ai_features[0].status, "on");
  assert.equal(again.properties.ai_features[0].confirmed_by, "Ben Ode");
});

test("seats write a tagged per-user line; changing seats updates it; 0 seats removes it", () => {
  const confirmed = host("Microsoft 365", { cost_lines: [], ...confirmFeature(host("Microsoft 365"), entry("m365-copilot"), "on", "Ana", NOW).properties });
  const first = setFeatureSeats(confirmed, "m365-copilot", 10, 2100, "Ana", NOW);
  const lines = first.properties.cost_lines!;
  assert.equal(lines.length, 1);
  assert.equal(lines[0].ai_feature, "m365-copilot");
  assert.equal(lines[0].type, "subscription");
  assert.equal(lines[0].vendor, "Microsoft");
  assert.deepEqual(lines[0].calculation, { kind: "per_user", seats: 10, unit_price_monthly_cents: 2100 });
  assert.equal(lineAnnualCents(lines[0]), 10 * 2100 * 12);
  assert.equal(first.properties.ai_features[0].cost_line_id, lines[0].id);

  const withSeats = host("Microsoft 365", { ...confirmed.properties, ...first.properties });
  const more = setFeatureSeats(withSeats, "m365-copilot", 25, 2100, "Ana", NOW);
  assert.equal(more.properties.cost_lines!.length, 1);
  assert.equal(lineAnnualCents(more.properties.cost_lines![0]), 25 * 2100 * 12);

  const none = setFeatureSeats(withSeats, "m365-copilot", 0, 2100, "Ana", NOW);
  assert.deepEqual(none.properties.cost_lines, []);
  assert.equal(none.properties.ai_features[0].cost_line_id, null);
  assert.throws(() => setFeatureSeats(withSeats, "slack-ai", 5, 100));
});

test("removing the feature removes its tagged line and keeps the others", () => {
  const other = {
    id: "line-1",
    type: "subscription",
    frequency: "annual",
    calculation: { kind: "flat" },
    amount_cents: 500000,
    vendor: "Microsoft",
    source: "invoice",
    created_at: NOW,
    created_by: "Ana",
    updated_at: NOW,
    updated_by: "Ana",
  };
  const base = host("Microsoft 365", { cost_lines: [other] });
  const confirmed = host("Microsoft 365", { ...base.properties, ...confirmFeature(base, entry("m365-copilot"), "on", "Ana", NOW).properties });
  const seated = host("Microsoft 365", { ...confirmed.properties, ...setFeatureSeats(confirmed, "m365-copilot", 10, 2100, "Ana", NOW).properties });
  assert.equal((seated.properties.cost_lines as unknown[]).length, 2);

  const removed = removeFeature(seated, "m365-copilot");
  assert.deepEqual(removed.properties.ai_features, []);
  assert.deepEqual(removed.properties.cost_lines, [other]);
  assert.equal("cost_lines" in removeFeature(confirmed, "m365-copilot").properties, false);
});

test("readFeatures drops junk", () => {
  assert.deepEqual(readFeatures({ ai_features: [null, "x", { key: "a" }, { key: "a", name: "A" }] }), [{ key: "a", name: "A" }]);
  assert.deepEqual(readFeatures({ ai_features: "nope" }), []);
  assert.deepEqual(readFeatures(undefined), []);
});
