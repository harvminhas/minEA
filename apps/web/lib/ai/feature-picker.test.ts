import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { AI_FEATURE_CATALOG } from "@minea/types";
import { FEATURE_PICKER_HELPER, customOptionLabel, featurePicker } from "./feature-picker.ts";
import { addCustomFeature } from "./features.ts";
import { aiLandscape } from "./landscape.ts";

const app = (name: string, properties: Record<string, unknown> = {}) => ({ id: name, type: "application", name, status: "active", properties });

test("the app's own vendor comes first under From <vendor>", () => {
  const view = featurePicker(app("Zoom"), [], "");
  assert.equal(view.ownHeading, "From Zoom");
  assert.ok(view.own.length > 0 && view.own.every((entry) => entry.vendor === "Zoom"));
  assert.ok(view.others.every((entry) => entry.vendor !== "Zoom"));
  assert.equal(view.helper, false);
  const byVendor = featurePicker(app("Our CRM", { vendor: "HubSpot" }), [], "");
  assert.equal(byVendor.ownHeading, "From HubSpot");
  assert.ok(byVendor.own.some((entry) => entry.vendor === "HubSpot"));
});

test("unmatched text always ends with a custom add; an exact name does not", () => {
  const view = featurePicker(app("Intranet"), [], "Smart replies");
  assert.equal(view.custom, "Smart replies");
  assert.equal(customOptionLabel(view.custom!), '+ Add "Smart replies" as an AI feature');
  const name = AI_FEATURE_CATALOG[0]!.name;
  assert.equal(featurePicker(app("Intranet"), [], name.toUpperCase()).custom, null);
  assert.equal(featurePicker(app("Intranet"), [], "  ").custom, null);
  const partial = featurePicker(app("Intranet"), [], "copilot");
  assert.ok(partial.others.length > 0);
  assert.equal(partial.custom, "copilot", "a partial match still offers the custom add");
});

test("empty search on an app with no catalog matches shows the helper", () => {
  assert.equal(featurePicker(app("Intranet"), [], "").helper, true);
  assert.equal(featurePicker(app("Intranet"), [], "x").helper, false);
  assert.equal(FEATURE_PICKER_HELPER, 'Type the name of the AI feature, e.g. "Smart replies"');
});

test("a custom feature shows in AI landscape like a catalog one, flagged vendor training unknown", () => {
  const host = app("Intranet");
  const patch = addCustomFeature(host, "Smart replies", "Ana", "2026-10-12T00:00:00Z");
  const result = aiLandscape({ objects: [{ ...host, properties: patch.properties }], relationships: [] });
  const item = result.features.find((entry) => entry.feature.name === "Smart replies");
  assert.ok(item, "listed in landscape features");
  assert.equal(item!.feature.vendor_trains, "unknown");
  assert.ok(result.flags.some((flag) => flag.id === "F2" && flag.itemIds.includes(item!.id)));
});

test("the picker wires Enter and the custom row to onCustom", () => {
  const src = readFileSync(new URL("../../components/mvp/AiFeaturesSection.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(view\.custom\) onCustom\(view\.custom\)/);
  assert.match(src, /event\.key !== "Enter"/);
  assert.match(src, /data-testid="ai-feature-custom"/);
});
