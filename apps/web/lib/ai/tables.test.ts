import assert from "node:assert/strict";
import { test } from "node:test";
import type { MinEAObject, Relationship } from "@minea/types";
import { AI_TABLE_COLUMNS, aiTableRows } from "./tables.ts";

function object(
  id: string,
  type: MinEAObject["type"],
  name: string,
  extra: Partial<MinEAObject> = {}
): MinEAObject {
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
    ...extra,
  };
}

function edge(type: Relationship["type"], from: MinEAObject, to: MinEAObject): Relationship {
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

const studio = object("studio", "cloud_service", "Copilot Studio");
const foundry = object("foundry", "cloud_service", "Azure AI Foundry");
const gpt = object("gpt", "ai_model", "GPT-4o");
const claude = object("claude", "ai_model", "Claude Sonnet", { properties: { vendor: "Anthropic" } });
const openai = object("openai", "external_party", "OpenAI");
const assistant = object("assistant", "agent", "Sales Assistant", {
  properties: { annual_cost: 1200 },
  owner_team_name: "Sales Ops",
});
const triage = object("triage", "agent", "Support Triage");
const salesforce = object("sf", "application", "Salesforce");
const lake = object("lake", "data_store", "Sales lakehouse");

const objects = [studio, foundry, gpt, claude, openai, assistant, triage, salesforce, lake];
const relationships = [
  edge("built_on", assistant, studio),
  edge("uses_model", assistant, gpt),
  edge("reads", assistant, lake),
  edge("reads", assistant, salesforce),
  edge("writes", assistant, salesforce),
  edge("runs_on", gpt, foundry),
  edge("supplied_by", gpt, openai),
];

test("AI agent and model tables follow the columns", () => {
  const agents = aiTableRows("agent", objects, relationships);
  const models = aiTableRows("ai_model", objects, relationships);
  assert.deepEqual(
    agents.map((row) => row.cells),
    [
      ["Sales Assistant", "Copilot Studio", "GPT-4o", "2 read · 1 write", "Sales Ops", "$1,200"],
      ["Support Triage", "—", "—", "—", "—", "—"],
    ]
  );
  assert.deepEqual(
    models.map((row) => row.cells),
    [
      ["Claude Sonnet", "—", "Anthropic", "—", "—"],
      ["GPT-4o", "Azure AI Foundry", "OpenAI", "1 agent", "—"],
    ]
  );
  for (const row of agents) assert.equal(row.cells.length, AI_TABLE_COLUMNS.agent.length);
  for (const row of models) assert.equal(row.cells.length, AI_TABLE_COLUMNS.ai_model.length);
});
