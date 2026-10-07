import assert from "node:assert/strict";
import { test } from "node:test";
import type { MinEAObject, Relationship } from "@minea/types";
import { rowFromObject } from "../model-catalog.ts";
import { connectionPhrase, impactOf, type ImpactEdge } from "./relationship-impact.ts";
import { impactNodes } from "./nodes.ts";

function object(id: string, type: MinEAObject["type"], name: string): MinEAObject {
  return {
    id,
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

function edge(type: Relationship["type"], from: { id: string; type: MinEAObject["type"] }, to: { id: string; type: MinEAObject["type"] }): Relationship {
  return {
    id: `${from.id}-${type}-${to.id}`,
    workspace_id: "ws",
    org_id: "org",
    type,
    from_object_id: from.id,
    from_type: from.type,
    to_object_id: to.id,
    to_type: to.type,
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}

test("impact names resolve loaded relationship ends", () => {
  const agent = object("agent", "agent", "QA agent");
  const model = object("model", "ai_model", "QA GPT-4o");
  const store = object("store", "data_store", "QA store");
  const site = object("site", "location", "QA office");
  const party = object("party", "external_party", "QA vendor");
  const objects = [agent, model, store, site, party];
  const relationships = [
    edge("uses_model", agent, model),
    edge("reads", agent, store),
    edge("supplied_by", model, party),
    edge("located_at", store, site),
  ];
  const rows = objects.flatMap((item) => {
    const row = rowFromObject(item);
    return row ? [{ id: row.id, name: row.name, typeLabel: row.typeLabel }] : [];
  });
  assert.equal(rows.length, 0);
  const nodes = impactNodes(rows, objects, relationships);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  assert.equal(byId.get("agent")?.name, "QA agent");
  assert.equal(byId.get("agent")?.typeLabel, "AI agent");
  assert.equal(byId.get("model")?.name, "QA GPT-4o");
  assert.equal(byId.get("model")?.typeLabel, "AI model");
  assert.equal(byId.get("store")?.name, "QA store");
  assert.equal(byId.get("site")?.name, "QA office");
  assert.equal(byId.get("party")?.name, "QA vendor");
  assert.equal(nodes.some((node) => node.name.startsWith("Unnamed")), false);

  const edges: ImpactEdge[] = relationships.map((rel) => ({
    type: rel.type,
    fromId: rel.from_object_id,
    toId: rel.to_object_id,
  }));
  const hit = impactOf(nodes, edges, "model").find((item) => item.name === "QA agent");
  assert.ok(hit);
  assert.equal(connectionPhrase(hit, nodes), "Uses model QA GPT-4o");
});

test("an unloaded relationship end stays Unnamed ai model", () => {
  const agent = object("agent", "agent", "QA agent");
  const nodes = impactNodes([], [agent], [edge("uses_model", agent, { id: "missing", type: "ai_model" })]);
  assert.equal(nodes.find((node) => node.id === "missing")?.name, "Unnamed ai model");
});
