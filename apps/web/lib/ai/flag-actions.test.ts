import test from "node:test";
import assert from "node:assert/strict";
import { FLAG_ACTIONS, FLAG_LABELS, destinationHref, flagDestination, flagRowId, sortFlagsByCode } from "./flag-actions.ts";
import { aiLandscape, type LandscapeFlag } from "./landscape.ts";
import { REGISTRY } from "../fields/registry.ts";

const flag = (id: LandscapeFlag["id"], itemIds: string[], fixOn?: string): LandscapeFlag => ({ id, severity: "high", itemIds, why: "", ...FLAG_LABELS[id], ...(fixOn ? { fixOn } : {}) });
const RECORD: Record<string, keyof typeof REGISTRY> = { agent: "agent", app: "application", model: "ai_model" } as never;
const fieldExists = (type: string, key: string) => (REGISTRY as Record<string, { key: string }[]>)[type]?.some((def) => def.key === key);

test("every flag type has an action builder", () => {
  assert.deepEqual(Object.keys(FLAG_ACTIONS).sort(), Object.keys(FLAG_LABELS).sort());
});

test("every flag action opens a real record at a real field or link list", () => {
  const cases: [LandscapeFlag, string][] = [
    [flag("F1", ["app1:copilot"]), "app"], [flag("F1", ["bot"]), "agent"],
    [flag("F2", ["app1:copilot"]), "app"], [flag("F2", ["bot"], "gpt"), "model"],
    [flag("F3", ["bot"]), "agent"], [flag("F4", ["bot"]), "agent"], [flag("F5", ["bot"]), "agent"],
    [flag("F6", ["bot", "bot2"]), "agent"], [flag("F6", ["app1:copilot", "bot"]), "app"],
  ];
  const seen = new Set<string>();
  for (const [item, kind] of cases) {
    seen.add(item.id);
    const dest = flagDestination(item);
    assert.ok(dest.recordId && !dest.recordId.includes(":"), `${item.id} record id`);
    if (dest.highlight) assert.ok(["reads", "writes"].includes(dest.highlight));
    else assert.ok(dest.focus && fieldExists(RECORD[kind] as string, dest.focus), `${item.id} -> ${dest.focus} on ${RECORD[kind]}`);
  }
  assert.deepEqual([...seen].sort(), Object.keys(FLAG_LABELS).sort());
});

test("destinations as URLs", () => {
  assert.equal(destinationHref("/m/agents/bot", flagDestination(flag("F3", ["bot"]))), "/m/agents/bot?focus=owner");
  assert.equal(destinationHref("/m/agents/bot", flagDestination(flag("F4", ["bot"]))), "/m/agents/bot?tab=relationships&highlight=writes");
  assert.equal(destinationHref("/m/ai-models/gpt", flagDestination(flag("F2", ["bot"], "gpt"))), "/m/ai-models/gpt?focus=vendor_trains");
  assert.equal(flagDestination(flag("F2", ["bot"], "gpt")).recordId, "gpt");
});

test("the landscape sets fixOn to the model for an agent's training flag", () => {
  const objects = [
    { id: "bot", type: "agent", name: "Bot", status: "active", properties: { status: "active" } },
    { id: "gpt", type: "ai_model", name: "GPT", status: "active", properties: {} },
  ];
  const result = aiLandscape({ objects: objects as never, relationships: [{ id: "r", type: "uses_model", from_object_id: "bot", to_object_id: "gpt" }] as never });
  const f2 = result.flags.find((item) => item.id === "F2");
  assert.equal(f2?.fixOn, "gpt");
});

test("chips sort numerically and row ids are stable DOM ids", () => {
  assert.deepEqual(sortFlagsByCode([{ id: "F4" }, { id: "F10" }, { id: "F2" }, { id: "F3" }]).map((f) => f.id), ["F2", "F3", "F4", "F10"]);
  assert.match(flagRowId(flag("F1", ["app1:copilot"])), /^[A-Za-z0-9_-]+$/);
});
