import assert from "node:assert/strict";
import test from "node:test";
import { whereStepSeed } from "../../components/mvp/setup-flow.tsx";

test("where-step seed: unhosted saved apps, saved servers keyed by normalised name", () => {
  const seed = whereStepSeed(
    [
      { id: "a1", name: "Order Entry", type: "application" },
      { id: "a2", name: "Shopify", type: "application" },
      { id: "s1", name: "AS400", type: "model" },
    ],
    [{ type: "runs_on", from_object_id: "a2" }],
  );
  assert.deepEqual(seed.drafts, [{ id: "a1", name: "Order Entry" }]);
  assert.deepEqual(seed.serverIds, { as400: "s1" });
});
