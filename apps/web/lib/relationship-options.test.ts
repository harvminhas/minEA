import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRelationshipOptionsForTarget, siblingOption } from "./relationship-options.ts";

test("a platform linking an app is offered Hosts, saved as the app running on it", () => {
  const options = buildRelationshipOptionsForTarget("cloud_service", "application");
  const hosts = options.find((option) => option.label === "Hosts");
  assert.ok(hosts, JSON.stringify(options));
  assert.equal(hosts.type, "runs_on");
  assert.equal(hosts.direction, "inverse");
  assert.ok(options.every((option) => !/inbound/i.test(option.label)));
});

test("labels are unique in each picker", () => {
  for (const [from, to] of [
    ["application", "application"],
    ["application", "cloud_service"],
    ["cloud_service", "application"],
    ["external_party", "application"],
    ["agent", "ai_model"],
    ["capability", "application"],
  ]) {
    const labels = buildRelationshipOptionsForTarget(from, to).map((option) => option.label);
    assert.equal(new Set(labels).size, labels.length, `${from}>${to}: ${labels.join(", ")}`);
  }
});

test("a mutual type offers both directions, a symmetric one does not double up", () => {
  const options = buildRelationshipOptionsForTarget("application", "application");
  const dep = options.filter((option) => option.type === "depends_on");
  assert.deepEqual(dep.map((option) => option.label).sort(), ["Depends on", "Needed by"]);
  const swap = siblingOption(options, dep[0]);
  assert.ok(swap && swap.direction !== dep[0].direction);
});
