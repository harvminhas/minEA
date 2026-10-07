import assert from "node:assert/strict";
import { test } from "node:test";
import type { MinEAObject } from "@minea/types";
import { catalogStats, rowForPanel, rowFromObject } from "./model-catalog.ts";

function object(type: MinEAObject["type"], name: string): MinEAObject {
  return {
    id: name,
    workspace_id: "ws",
    org_id: "org",
    type,
    name,
    tags: [],
    properties: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("an empty properties blob still lists the platform and the server", () => {
  const platform = rowFromObject(object("cloud_service", "Old platform"));
  const server = rowFromObject(object("model", "Old server"));
  assert.equal(platform?.kind, "platform");
  assert.equal(server?.kind, "runtime");
  assert.equal(platform?.typeLabel, "SaaS platform");
  assert.equal(server?.typeLabel, "Server");
});

test("agents and AI models open in the panel and stay out of the catalog tables", () => {
  const platformRow = rowFromObject(object("cloud_service", "Old platform"));
  assert.ok(platformRow);
  const agent = object("agent", "Sales Assistant");
  const model = object("ai_model", "GPT-4o");
  assert.equal(rowFromObject(agent), null);
  assert.equal(rowFromObject(model), null);
  assert.equal(rowForPanel(agent)?.typeLabel, "AI agent");
  assert.equal(rowForPanel(model)?.typeLabel, "AI model");
  const listed = [agent, model].map((item) => rowFromObject(item)).filter((row) => row != null);
  assert.deepEqual(catalogStats([platformRow]), catalogStats([platformRow, ...listed]));
});
