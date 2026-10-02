import assert from "node:assert/strict";
import { test } from "node:test";
import { locationMigrationPlan } from "./locations.ts";

test("place names that differ only by case and space become one location", () => {
  const plan = locationMigrationPlan([
    { id: "a", name: "AS400", location: "fremont plant" },
    { id: "b", name: "HV01", location: "Fremont Plant " },
    { id: "c", name: "NAS01", location: "Sacramento colo" },
  ]);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0], { name: "fremont plant", serverIds: ["a", "b"] });
  assert.deepEqual(plan[1]?.serverIds, ["c"]);
});
