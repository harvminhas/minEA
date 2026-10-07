import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_FEATURE_CATALOG } from "@minea/types";
import { lineAnnualCents } from "../cost/math.ts";
import { catalogEntriesFor } from "./catalog.ts";
import { applyPatch } from "../fields/save.ts";
import {
  addCustomFeature,
  agentsTouching,
  aiColumnLabel,
  confirmFeature,
  featureCostLabel,
  featureFlags,
  readFeatures,
  removeFeature,
  setFeatureSeats,
  suggestedFeatures,
  updateFeature,
} from "./features.ts";

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

test("updateFeature: a status change records who confirmed it; other edits keep it", () => {
  const object = host("Microsoft 365", confirmFeature(host("Microsoft 365"), entry("m365-copilot"), "unreviewed", "Ana", NOW).properties);
  assert.equal(readFeatures(object.properties)[0].confirmed_at, null);
  const on = updateFeature(object, "m365-copilot", { status: "on" }, "Ben", NOW).properties.ai_features[0];
  assert.equal(on.status, "on");
  assert.equal(on.confirmed_by, "Ben");
  const edited = updateFeature(host("Microsoft 365", { ai_features: [on] }), "m365-copilot", { audience: "admins", vendor_trains: "unknown" }, "Cy", "2026-10-08T00:00:00.000Z").properties.ai_features[0];
  assert.equal(edited.audience, "admins");
  assert.equal(edited.vendor_trains, "unknown");
  assert.equal(edited.confirmed_by, "Ben");
  assert.equal(edited.confirmed_at, NOW);
  assert.throws(() => updateFeature(object, "slack-ai", { status: "on" }, "Ana"));
});

test("addCustomFeature makes a custom-<slug> key, unique on the record, with unknown answers", () => {
  const first = addCustomFeature(host("Intranet"), "  Glean Assistant ", "Ana", NOW).properties.ai_features;
  assert.deepEqual(first, [
    { key: "custom-glean-assistant", name: "Glean Assistant", status: "on", audience: null, sees_company_data: "unknown", vendor_trains: "unknown", source: "user", confirmed_at: NOW, confirmed_by: "Ana" },
  ]);
  const second = addCustomFeature(host("Intranet", { ai_features: first }), "Glean assistant", "Ana", NOW).properties.ai_features;
  assert.equal(second[1].key, "custom-glean-assistant-2");
  assert.throws(() => addCustomFeature(host("Intranet"), "  ", "Ana"));
});

test("featureFlags: F1 needs a customer/financial host, F2 follows vendor_trains, off features have none", () => {
  const copilot = { ...confirmFeature(host("Microsoft 365"), entry("m365-copilot"), "on", "Ana", NOW).properties.ai_features[0] };
  const sensitive = host("Microsoft 365", { holds_data: ["customer"] });
  assert.deepEqual(featureFlags(copilot, sensitive).map((flag) => `${flag.id}:${flag.severity}`), ["F1:high"]);
  assert.deepEqual(featureFlags(copilot, host("Microsoft 365", { holds_data: ["none"] })), []);
  assert.deepEqual(featureFlags(copilot, host("Microsoft 365", { category: "ERP" })).map((flag) => flag.id), ["F1"]);
  assert.deepEqual(featureFlags({ ...copilot, sees_company_data: "unknown" }, sensitive).map((flag) => `${flag.id}:${flag.severity}`), ["F1:check"]);
  assert.deepEqual(featureFlags({ ...copilot, vendor_trains: "yes" }, host("Notes")).map((flag) => `${flag.id}:${flag.severity}`), ["F2:high"]);
  assert.deepEqual(featureFlags({ ...copilot, vendor_trains: "unknown" }, host("Notes")).map((flag) => `${flag.id}:${flag.severity}`), ["F2:check"]);
  assert.deepEqual(featureFlags({ ...copilot, status: "off", vendor_trains: "yes" }, sensitive), []);
});

test("Microsoft 365 sample: 2 confirmed + 1 suggestion, seats label, and the table cell", () => {
  let object = host("Microsoft 365", { cost_lines: [] });
  const save = (patch: { properties: Record<string, unknown> }) => {
    const next = applyPatch({ id: "m365", type: "application", properties: object.properties as Record<string, unknown> }, { object: { properties: patch.properties } }, []);
    object = host("Microsoft 365", next.properties);
  };
  save(confirmFeature(object, entry("m365-copilot"), "on", "Ana", NOW));
  save(confirmFeature(object, entry("m365-copilot-chat"), "on", "Ana", NOW));
  assert.deepEqual(keys(suggestedFeatures(object)), ["teams-premium-recap"]);
  assert.equal(aiColumnLabel(object), "2 on · 1 to review");

  save(setFeatureSeats(object, "m365-copilot", 25, 2100, "uid-1", NOW));
  const [copilot, chat] = readFeatures(object.properties);
  assert.equal(featureCostLabel(copilot, object.properties), "25 seats × $21 /user/mo = $6,300 / yr");
  assert.equal(featureCostLabel(chat, object.properties), "Included in your plan");
  const agents = addCustomFeature(object, "Breeze", "Ana", NOW).properties.ai_features.at(-1)!;
  assert.equal(featureCostLabel(agents, object.properties), "");
  assert.equal(featureCostLabel({ ...agents, key: "zendesk-ai-agents" }, object.properties), "$1.50–$2.00 per automated resolution");

  save(removeFeature(object, "m365-copilot"));
  assert.deepEqual(object.properties.cost_lines, []);
  assert.equal(aiColumnLabel(object), "1 on · 2 to review");
  assert.equal(aiColumnLabel(host("Microsoft 365", {}, "model")), "");
  assert.equal(aiColumnLabel(host("Payroll")), "");
});

test("agentsTouching lists agents that read or write this record", () => {
  const edges = [
    { type: "reads", from_object_id: "ag1", from_type: "agent", to_object_id: "m365" },
    { type: "writes", from_object_id: "ag2", from_type: "agent", to_object_id: "m365" },
    { type: "reads", from_object_id: "app2", from_type: "application", to_object_id: "m365" },
    { type: "reads", from_object_id: "ag3", from_type: "agent", to_object_id: "other" },
  ];
  const names = new Map([["ag1", "Invoice Reader"], ["ag2", "AP Inbox Agent"]]);
  assert.deepEqual(agentsTouching("m365", edges, names), [
    { id: "ag1", name: "Invoice Reader", verb: "reads from it" },
    { id: "ag2", name: "AP Inbox Agent", verb: "writes to it" },
  ]);
});

test("aiColumnLabel shows piloting on its own, not as on", () => {
  const salesforce = {
    type: "application",
    name: "Salesforce",
    properties: { ai_features: [{ key: "salesforce-agentforce", name: "Agentforce", status: "piloting", sees_company_data: "yes", vendor_trains: "no", source: "catalog" }] },
  };
  assert.equal(aiColumnLabel(salesforce), "1 piloting");
});
