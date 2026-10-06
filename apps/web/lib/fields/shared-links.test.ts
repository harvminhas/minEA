import assert from "node:assert/strict";
import { test } from "node:test";
import { REGISTRY } from "./registry.ts";
import { readField, toPatch, type FieldEdge, type FieldRecord } from "./save.ts";
import { alsoInDetailsLabel, detailsAlsoSetsHint, isFieldManagedEdge, relationCreateLabel, suppliedByVendorClear } from "./shared-links.ts";

const record: FieldRecord = { id: "app", type: "application", properties: {} };
const builtOn = REGISTRY.application.find((field) => field.key === "built_on");
const edge: FieldEdge = {
  id: "r1",
  type: "built_on",
  from_object_id: "app",
  from_type: "application",
  to_object_id: "plat",
  to_type: "cloud_service",
};

test("a hosting link set in either place shows in both, and removing it clears both", () => {
  assert.ok(builtOn);
  const fromDetails = toPatch(builtOn, "plat", record, []);
  assert.equal(fromDetails.addRel?.[0]?.type, "built_on");
  assert.equal(fromDetails.addRel?.[0]?.from_object_id, "app");
  assert.equal(fromDetails.addRel?.[0]?.to_object_id, "plat");
  assert.equal(readField(builtOn, record, [edge]), "plat");
  assert.equal(isFieldManagedEdge(edge.type), true);
  const cleared = toPatch(builtOn, "", record, [edge]);
  assert.deepEqual(cleared.removeRelIds, ["r1"]);
  assert.equal(readField(builtOn, record, []), "");
});

test("field-managed links name the Details field", () => {
  assert.equal(detailsAlsoSetsHint("built_on", "application"), "This also sets Built on platform in Details");
  assert.equal(detailsAlsoSetsHint("runs_on", "model"), "This also sets Runs on in Details");
  assert.equal(detailsAlsoSetsHint("located_at", "application"), "This also sets Location in Details");
  assert.equal(detailsAlsoSetsHint("supplied_by", "cloud_service"), "This also sets Vendor in Details");
  assert.equal(detailsAlsoSetsHint("depends_on", "application"), null);
});

test("Also in Details is only on the side that has the field", () => {
  const built = { type: "built_on", from_object_id: "app" };
  assert.equal(alsoInDetailsLabel(built, "app", "application"), "Built on platform");
  assert.equal(alsoInDetailsLabel(built, "plat", "cloud_service"), null);
  const vendor = { type: "supplied_by", from_object_id: "app" };
  assert.equal(alsoInDetailsLabel(vendor, "app", "application"), "Vendor");
  assert.equal(alsoInDetailsLabel(vendor, "party", "external_party"), null);
});

test("removing a supplied_by link clears the stored vendor text", () => {
  assert.deepEqual(
    suppliedByVendorClear({ type: "supplied_by", from_object_id: "app" }, "app"),
    { properties: { vendor: null } },
  );
  assert.equal(suppliedByVendorClear({ type: "supplied_by", from_object_id: "vendor" }, "app"), null);
  assert.equal(suppliedByVendorClear({ type: "built_on", from_object_id: "app" }, "app"), null);
});

test("an empty hosting picker offers to create the typed name", () => {
  assert.equal(relationCreateLabel(["cloud_service"], "Azure", []), "+ Create 'Azure'");
  assert.equal(relationCreateLabel(["model"], "AS400", []), "+ Create 'AS400'");
  assert.equal(relationCreateLabel(["cloud_service"], "Azure", ["Azure"]), null);
  assert.equal(relationCreateLabel(["cloud_service"], "", []), null);
});
