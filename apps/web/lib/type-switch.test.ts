import assert from "node:assert/strict";
import { test } from "node:test";
import type { Relationship } from "@minea/types";
import { planTypeSwitch, readableTypeConflict } from "./type-switch.ts";

function rel(id: string, type: Relationship["type"], fromId: string, fromType: Relationship["from_type"], toId: string, toType: Relationship["to_type"]): Relationship {
  return {
    id,
    workspace_id: "w",
    org_id: "o",
    type,
    from_object_id: fromId,
    from_type: fromType,
    to_object_id: toId,
    to_type: toType,
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}

test("the type switch keeps the record id and lists invalid links", () => {
  const plan = planTypeSwitch({
    objectId: "edi",
    objectName: "EDI",
    currentType: "application",
    nextType: "cloud_service",
    relationships: [
      rel("host", "built_on", "edi", "application", "azure", "cloud_service"),
      rel("server", "runs_on", "edi", "application", "as400", "model"),
      rel("vendor", "supplied_by", "edi", "application", "ms", "external_party"),
      rel("dep", "depends_on", "other", "application", "edi", "application"),
    ],
    nameOf: (id) => ({ azure: "Azure", as400: "AS400", ms: "Microsoft", other: "HubSpot" })[id] ?? id,
  });
  assert.equal(plan.objectId, "edi");
  const kept = new Map(plan.kept.map((item) => [item.id, item]));
  assert.deepEqual([...kept.keys()].sort(), ["server", "vendor"]);
  assert.equal(kept.get("server")?.type, "runs_on");
  assert.equal(kept.get("vendor")?.id, "vendor");
  assert.equal(plan.remapped.length, 1);
  assert.equal(plan.remapped[0]?.id, "host");
  assert.equal(plan.remapped[0]?.type, "runs_on");
  assert.equal(plan.remapped[0]?.from_type, "cloud_service");
  assert.deepEqual(plan.invalid.map((item) => item.id), ["dep"]);
  assert.equal(plan.invalid[0]?.line, "Needed by HubSpot");
  assert.deepEqual(plan.merged, []);
});

test("an app built on a platform is listed when the platform becomes an application", () => {
  const plan = planTypeSwitch({
    objectId: "azure",
    objectName: "Azure",
    currentType: "cloud_service",
    nextType: "application",
    relationships: [rel("built", "built_on", "edi", "application", "azure", "cloud_service")],
    nameOf: () => "EDI",
  });
  assert.equal(plan.objectId, "azure");
  assert.equal(plan.kept.length, 0);
  assert.equal(plan.remapped.length, 0);
  assert.deepEqual(plan.invalid.map((item) => item.id), ["built"]);
  assert.deepEqual(plan.merged, []);
});

test("a remap that duplicates an existing link is a merge", () => {
  const plan = planTypeSwitch({
    objectId: "edi",
    objectName: "EDI",
    currentType: "application",
    nextType: "cloud_service",
    relationships: [
      rel("host", "built_on", "edi", "application", "azure", "cloud_service"),
      rel("run", "runs_on", "edi", "application", "azure", "cloud_service"),
    ],
    nameOf: () => "Azure",
  });
  assert.equal(plan.kept[0]?.id, "run");
  assert.equal(plan.kept[0]?.type, "runs_on");
  assert.equal(plan.remapped.length, 0);
  assert.deepEqual(plan.merged, [{ id: "host", line: "merged into Runs on Azure" }]);
  assert.equal(plan.invalid.length, 0);
});

test("a 409 is the link lines and the ids to drop", () => {
  const parsed = readableTypeConflict('409 {"invalid":[{"id":"dep","line":"Needed by HubSpot"}]} (/orgs/x)');
  assert.equal(parsed?.message, "Needed by HubSpot");
  assert.deepEqual(parsed?.ids, ["dep"]);
  assert.equal(readableTypeConflict("500 no"), null);
  assert.equal(readableTypeConflict("409 not json (/orgs/x)")?.message, "These links changed. Review them and confirm again.");
});
