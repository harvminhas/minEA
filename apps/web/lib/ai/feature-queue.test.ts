import { test } from "node:test";
import assert from "node:assert/strict";
import type { MinEAObject } from "@minea/types";
import { mergeFreshCatalog, shapeCatalog } from "@/lib/use-model-catalog";
import { addCustomFeature, confirmFeature, customFeatureAdd, readFeatures, setFeatureSeats, updateFeature } from "./features";
import { catalogEntry } from "./catalog";
import { enqueueFeatureSave, resetFeatureLanes, type FeatureDeps } from "./feature-queue";

const NOW = "2026-10-07T12:00:00.000Z";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function record(id: string, properties: Record<string, unknown> = {}, stamp = 0): MinEAObject {
  return {
    id,
    type: "application",
    name: "QA App 4",
    status: "active",
    properties,
    updated_at: `2026-10-07T10:00:${String(stamp).padStart(2, "0")}.000000`,
  } as unknown as MinEAObject;
}

/** One row like objects.py: top-level properties merge, commits in the order requests arrive. */
function fakeServer(start: MinEAObject, latency: number[]) {
  let row = clone(start);
  let calls = 0;
  let stamp = 0;
  return {
    row: () => row,
    send: async (patch: { properties: Record<string, unknown> }) => {
      const sent = clone(patch);
      await sleep(latency[calls++] ?? 5);
      stamp += 1;
      row = record(row.id, { ...(row.properties as Record<string, unknown>), ...sent.properties }, stamp);
      return clone(row);
    },
  };
}

function fakeCache(start: MinEAObject) {
  let cached: MinEAObject | undefined = clone(start);
  const errors: string[] = [];
  return {
    errors,
    get: () => cached,
    set: (object: MinEAObject) => {
      cached = clone(object);
    },
    deps(send: FeatureDeps["send"]): FeatureDeps {
      return { read: () => cached, write: (object) => (cached = clone(object)), send, onError: (message) => errors.push(message) };
    },
  };
}

test("a catalog fetch that started before a save doesn't roll the record back", () => {
  const before = record("a", {}, 0);
  const added = record("a", { ai_features: [{ key: "custom-x", name: "X", status: "on", sees_company_data: "unknown", vendor_trains: "unknown", source: "user" }] }, 1);
  const stale = shapeCatalog({ objects: [before], relationships: [] });

  // A save is still waiting: keep the optimistic copy.
  const optimistic = { ...before, properties: added.properties } as MinEAObject;
  const waiting = mergeFreshCatalog(shapeCatalog({ objects: [optimistic], relationships: [] }), stale, (id) => id === "a");
  assert.equal(readFeatures(waiting.objects[0].properties).length, 1);

  // The save has landed: this tab's copy is newer than the fetch.
  const landed = mergeFreshCatalog(shapeCatalog({ objects: [added], relationships: [] }), stale, () => false);
  assert.equal(readFeatures(landed.objects[0].properties).length, 1);

  // A genuinely newer fetch still wins.
  const newer = record("a", {}, 2);
  const fresh = mergeFreshCatalog(shapeCatalog({ objects: [added], relationships: [] }), shapeCatalog({ objects: [newer], relationships: [] }), () => false);
  assert.equal(readFeatures(fresh.objects[0].properties).length, 0);
});

test("rapid add → status → seats keeps everything, in click order, even if the cache is rolled back mid-way", async () => {
  resetFeatureLanes();
  const start = record("qa4");
  const server = fakeServer(start, [60, 5, 30, 1]);
  const cache = fakeCache(start);
  const deps = cache.deps(server.send);
  const key = "custom-qa-custom-ai";

  const runs = [
    enqueueFeatureSave("o/w/qa4", (current) => addCustomFeature(current, "QA Custom AI", "QA", NOW), deps),
    enqueueFeatureSave("o/w/qa4", (current) => updateFeature(current, key, { status: "piloting" }, "QA", NOW), deps),
  ];
  // The page's catalog fetch lands now with the record as it was before the add.
  cache.set(start);
  runs.push(enqueueFeatureSave("o/w/qa4", (current) => updateFeature(current, key, { status: "on" }, "QA", NOW), deps));
  runs.push(enqueueFeatureSave("o/w/qa4", (current) => setFeatureSeats(current, key, 5, 2000, "QA", NOW), deps));
  // Every click shows at once.
  assert.equal(readFeatures(cache.get()?.properties)[0]?.cost_line_id, `ai-${key}`);
  await Promise.all(runs);

  const saved = readFeatures(server.row().properties);
  assert.deepEqual(saved.map((feature) => [feature.key, feature.status, feature.cost_line_id]), [[key, "on", `ai-${key}`]]);
  assert.equal((server.row().properties.cost_lines as unknown[]).length, 1);
  assert.deepEqual(cache.get()?.properties, server.row().properties);
  assert.deepEqual(cache.errors, []);
});

test("a failed save is dropped and later clicks still build from the server's copy", async () => {
  resetFeatureLanes();
  const start = record("qa5");
  const server = fakeServer(start, [5, 5]);
  const cache = fakeCache(start);
  let calls = 0;
  const deps = cache.deps(async (patch) => {
    calls += 1;
    if (calls === 2) throw new Error("Server said no");
    return server.send(patch);
  });
  const runs = [
    enqueueFeatureSave("o/w/qa5", (current) => addCustomFeature(current, "One", "QA", NOW), deps),
    enqueueFeatureSave("o/w/qa5", (current) => addCustomFeature(current, "Two", "QA", NOW), deps),
    enqueueFeatureSave("o/w/qa5", (current) => addCustomFeature(current, "Three", "QA", NOW), deps),
  ];
  await Promise.all(runs);
  assert.deepEqual(readFeatures(server.row().properties).map((feature) => feature.name), ["One", "Three"]);
  assert.deepEqual(readFeatures(cache.get()?.properties).map((feature) => feature.name), ["One", "Three"]);
  assert.deepEqual(cache.errors, ["Couldn't save: Server said no"]);
});

test("an add rebuilt on an answer that already contains it stays one feature (add + Copilot Chat on)", async () => {
  resetFeatureLanes();
  const start = { ...record("m365"), name: "Microsoft 365" } as MinEAObject;
  const server = fakeServer(start, [40, 5]);
  const cache = fakeCache(start);
  const deps = cache.deps(server.send);
  const add = customFeatureAdd("QA Custom AI", "QA", NOW);
  const chat = catalogEntry("m365-copilot-chat")!;
  await Promise.all([
    enqueueFeatureSave("o/w/m365", add, deps),
    enqueueFeatureSave("o/w/m365", (current) => confirmFeature(current, chat, "on", "QA", NOW), deps),
    // The same click replayed on top of the answer that already has it.
    enqueueFeatureSave("o/w/m365", add, deps),
  ]);
  const keys = readFeatures(server.row().properties).map((feature) => `${feature.key}:${feature.status}`);
  assert.deepEqual(keys, ["custom-qa-custom-ai:on", "m365-copilot-chat:on"]);
  assert.deepEqual(cache.get()?.properties, server.row().properties);
});
