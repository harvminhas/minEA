import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestGate, shouldRetryRequest } from "./request-gate.ts";

test("the gate never runs more than the limit at once", async () => {
  const gate = createRequestGate(2);
  let current = 0;
  let peak = 0;
  const tasks = Array.from({ length: 6 }, () =>
    gate.run(async () => {
      current += 1;
      peak = Math.max(peak, current);
      await new Promise((resolve) => setTimeout(resolve, 15));
      current -= 1;
    })
  );
  await Promise.all(tasks);
  assert.equal(peak, 2);
});

test("reads retry a transient 500 and writes do not", () => {
  assert.equal(shouldRetryRequest("GET", 500, 0, 3), true);
  assert.equal(shouldRetryRequest("GET", 503, 1, 3), true);
  assert.equal(shouldRetryRequest("GET", 500, 2, 3), false);
  assert.equal(shouldRetryRequest("GET", 404, 0, 3), false);
  assert.equal(shouldRetryRequest("POST", 500, 0, 3), false);
});
