import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCapabilityTree } from "./capability-tree";
import {
  capabilityDetailPath,
  capabilityOpenPath,
  coverageSummary,
  linksOn,
  moveTargetsFor,
  planMoveRelationship,
} from "./capability-detail";

const o = (id: string, type: string, name: string, properties: Record<string, unknown> = {}) => ({
  id,
  type,
  name,
  properties,
});

test("capability detail path includes an activity query when highlighting an activity", () => {
  assert.equal(
    capabilityDetailPath("/ws", "ap", { activity: "inv" }),
    "/ws/model/capabilities/ap?activity=inv"
  );
  assert.equal(capabilityDetailPath("/ws", "ap"), "/ws/model/capabilities/ap");
  assert.equal(
    capabilityDetailPath("/ws", "ap", { tab: "details", details: "inv", activity: "inv" }),
    "/ws/model/capabilities/ap?activity=inv&tab=details&details=inv"
  );
});

test("opening an activity goes to its parent capability with ?activity=", () => {
  const objects = [
    o("ap", "capability", "Accounts Payable", { domain_id: "fin" }),
    o("inv", "capability", "Invoice capture", { domain_id: "fin", parent_id: "ap" }),
  ];
  assert.equal(capabilityOpenPath("/ws", "inv", objects), "/ws/model/capabilities/ap?activity=inv");
  assert.equal(capabilityOpenPath("/ws", "ap", objects), "/ws/model/capabilities/ap");
});

test("moving a link to a sibling keeps attributes and creates before deleting", () => {
  const rel = {
    id: "r1",
    type: "supported_by",
    from_object_id: "inv",
    to_object_id: "qb",
    from_type: "capability",
    to_type: "application",
    attributes: { fitness: "weak", note: "keep me" },
  };
  const plan = planMoveRelationship(rel, "pay", []);
  assert.deepEqual(plan, {
    kind: "create-then-delete",
    sourceRelId: "r1",
    fromObjectId: "pay",
    toObjectId: "qb",
    toType: "application",
    attributes: { fitness: "weak", note: "keep me" },
  });
});

test("moving a link onto a target that already has that app only deletes the source", () => {
  const rel = {
    id: "r1",
    type: "supported_by",
    from_object_id: "inv",
    to_object_id: "qb",
    attributes: { fitness: "strong" },
  };
  const existing = [
    rel,
    { id: "r2", type: "supported_by", from_object_id: "ap", to_object_id: "qb" },
  ];
  const plan = planMoveRelationship(rel, "ap", existing);
  assert.deepEqual(plan, { kind: "delete-source", sourceRelId: "r1" });
});

test("coverage summary is Partial when a capability has apps but uncovered activities", () => {
  const d = o("d", "business_domain", "Finance");
  const ap = o("ap", "capability", "AP", { domain_id: "d" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "d", parent_id: "ap" });
  const pay = o("pay", "capability", "Vendor payments", { domain_id: "d", parent_id: "ap" });
  const sage = o("sage", "application", "Sage");
  const tree = buildCapabilityTree(
    [d, ap, inv, pay, sage],
    [{ type: "supported_by", from_object_id: "ap", to_object_id: "sage" }]
  );
  const node = tree[0]!.children[0]!;
  const summary = coverageSummary(node);
  assert.equal(summary.headline, "Partial");
  assert.equal(summary.detail, "0 of 2 activities have an app");
  assert.equal(summary.tone, "fair");
  assert.deepEqual(
    moveTargetsFor(node, "inv").map((t) => t.id),
    ["ap", "pay"]
  );
});

test("linksOn lists direct apps on a target and ignores other levels", () => {
  const apps = new Map([
    ["sage", { id: "sage", name: "Sage", type: "application" }],
    ["qb", { id: "qb", name: "QuickBooks", type: "application" }],
  ]);
  const edges = [
    { id: "r1", type: "supported_by", from_object_id: "ap", to_object_id: "sage" },
    { id: "r2", type: "supported_by", from_object_id: "inv", to_object_id: "qb" },
  ];
  assert.deepEqual(
    linksOn("ap", edges, apps).map((link) => link.appName),
    ["Sage"]
  );
  assert.deepEqual(
    linksOn("inv", edges, apps).map((link) => link.appName),
    ["QuickBooks"]
  );
});

test("capability detail view and app form picker stay in source", () => {
  const page = readFileSync(new URL("../components/capability-map/CapabilityDetailPage.tsx", import.meta.url), "utf8");
  const view = readFileSync(new URL("../components/capability-map/CapabilityDetailView.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../components/capability-map/AddRelationshipDialog.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../components/objects/MapTargetPicker.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/objects/ObjectForm.tsx", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../components/mvp/ModelScreen.tsx", import.meta.url), "utf8");
  assert.match(view, /data-testid="capability-detail"/);
  assert.match(view, /Back to map/);
  assert.match(view, /Add relationship/);
  assert.match(dialog, /data-testid="add-relationship-dialog"/);
  assert.match(dialog, /Create a new app/);
  assert.match(picker, /data-testid="map-target-picker"/);
  assert.match(picker, /Activity/);
  assert.match(form, /MapTargetPicker/);
  assert.doesNotMatch(form, /Pick L2 capabilities from your capability map/);
  assert.match(screen, /CapabilityDetailPage/);
  assert.match(page, /tab=details|tab: "details"/);
});
