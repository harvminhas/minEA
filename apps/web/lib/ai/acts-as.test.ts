import assert from "node:assert/strict";
import { test } from "node:test";
import { actsAsFlag, actsAsLabel, readActsAs } from "./acts-as.ts";

test("readActsAs keeps the three shapes and drops anything else", () => {
  assert.deepEqual(readActsAs({ type: "contact", id: " c1 ", name: " Ana Silva " }), {
    type: "contact",
    id: "c1",
    name: "Ana Silva",
  });
  assert.deepEqual(readActsAs({ type: "team", id: " t1 ", name: " Sales " }), {
    type: "team",
    id: "t1",
    name: "Sales",
  });
  assert.deepEqual(readActsAs({ type: "service_account", id: "drop-me", name: " svc-sales " }), {
    type: "service_account",
    name: "svc-sales",
  });

  for (const bad of [
    null,
    "",
    "Ana",
    [],
    {},
    { type: "contact", name: "Ana" },
    { type: "team", id: "t1", name: "  " },
    { type: "robot", name: "x" },
  ]) {
    assert.equal(readActsAs(bad), null);
  }
});

test("actsAsLabel names the kind and actsAsFlag only marks a person", () => {
  assert.equal(actsAsLabel({ type: "contact", id: "c1", name: "Ana Silva" }), "Ana Silva · Person");
  assert.equal(actsAsLabel({ type: "service_account", name: "svc-sales" }), "svc-sales · Service account");
  assert.equal(actsAsLabel(null), "");
  assert.equal(actsAsFlag({ type: "contact", id: "c1", name: "Ana Silva" }), "Flagged: uses a person's account");
  assert.equal(actsAsFlag({ type: "team", id: "t1", name: "Sales" }), null);
  assert.equal(actsAsFlag({ type: "service_account", name: "svc-sales" }), null);
  assert.equal(actsAsFlag(""), null);
});
