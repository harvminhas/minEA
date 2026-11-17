import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCapabilityTree } from "./capability-tree";
import {
  capabilityDetailPath,
  capabilityDomainMapPath,
  capabilityOpenPath,
  coverageSummary,
  fitnessSummary,
  overlapNote,
  redundancySummary,
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

test("a domain opens the capability map focused on that domain", () => {
  assert.equal(capabilityDomainMapPath("/ws", "fin"), "/ws/model/capabilities?domain=fin");
  assert.equal(capabilityDomainMapPath("/ws", "no-domain"), "/ws/model/capabilities");
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
  assert.doesNotMatch(view, /\+ Link app/);
  assert.match(view, /role="button"/);
  assert.match(view, /cursor-pointer/);
  assert.match(view, /isCardChromeTarget/);
  assert.match(view, /event.key === "Enter" \|\| event.key === " "/);
  assert.match(view, /data-no-card-nav/);
  assert.match(view, /borderLeftColor/);
  assert.match(view, /domain-theme-icon/);
  assert.match(view, /themeForDomain/);
  assert.match(view, /data-testid="capability-assessment"/);
  assert.match(view, /fitness-setter/);
  assert.match(view, /onSetFitness/);
  assert.match(page, /updateAttributes/);
  const heat = readFileSync(new URL("../components/capability-map/CapabilityHeatMap.tsx", import.meta.url), "utf8");
  assert.match(heat, /label: "Fitness"/);
  assert.match(heat, /label: "Redundancy"/);
  assert.match(dialog, /Activity/);
  assert.match(dialog, /data-testid="add-relationship-dialog"/);
  assert.match(dialog, /Create a new app/);
  assert.match(picker, /data-testid="map-target-picker"/);
  assert.match(picker, /Activity/);
  assert.match(form, /MapTargetPicker/);
  assert.doesNotMatch(form, /Pick L2 capabilities from your capability map/);
  assert.match(screen, /CapabilityDetailPage/);
  assert.match(page, /tab=details|tab: "details"/);
});

test("assessment summaries follow weakest-link fitness and inherited redundancy", () => {
  const d = o("d", "business_domain", "Finance");
  const ap = o("ap", "capability", "Accounts Payable", { domain_id: "d" });
  const inv = o("inv", "capability", "Invoice capture", { domain_id: "d", parent_id: "ap" });
  const pay = o("pay", "capability", "Vendor payments", { domain_id: "d", parent_id: "ap" });
  const sage = o("sage", "application", "Sage");
  const qb = o("qb", "application", "QuickBooks");
  const epic = o("epic", "application", "Epic");
  const tree = buildCapabilityTree(
    [d, ap, inv, pay, sage, qb, epic],
    [
      { type: "supported_by", from_object_id: "ap", to_object_id: "sage", attributes: { fitness: "strong" } },
      { type: "supported_by", from_object_id: "inv", to_object_id: "qb", attributes: { fitness: "adequate" } },
      { type: "supported_by", from_object_id: "inv", to_object_id: "epic", attributes: { fitness: "weak" } },
      { type: "supported_by", from_object_id: "pay", to_object_id: "qb", attributes: { fitness: "strong" } },
    ]
  );
  const node = tree[0]!.children[0]!;
  const fitness = fitnessSummary(node);
  assert.equal(fitness.headline, "Weak");
  assert.equal(fitness.detail, "Weakest link: Epic on Invoice capture");
  assert.equal(fitness.tone, "gap");
  const redundancy = redundancySummary(node);
  assert.equal(redundancy.headline, "Overlap");
  assert.equal(redundancy.detail, "QuickBooks and Epic overlap on Invoice capture");
  assert.equal(redundancy.tone, "fair");
  assert.equal(overlapNote(["QuickBooks", "Epic"]), "QuickBooks and Epic both support this activity.");
  assert.equal(
    overlapNote(["Power BI", "Dynamics 365"], "capability"),
    "Power BI and Dynamics 365 both support this capability."
  );
});

test("redundancy summary does not repeat this record's own name", () => {
  const d = o("d", "business_domain", "Customer");
  const home = o("home", "capability", "Homebuyer Experience", { domain_id: "d" });
  const pbi = o("pbi", "application", "Power BI");
  const dyn = o("dyn", "application", "Dynamics 365");
  const tree = buildCapabilityTree(
    [d, home, pbi, dyn],
    [
      { type: "supported_by", from_object_id: "home", to_object_id: "pbi", attributes: { fitness: "strong" } },
      { type: "supported_by", from_object_id: "home", to_object_id: "dyn", attributes: { fitness: "adequate" } },
    ]
  );
  const node = tree[0]!.children[0]!;
  const redundancy = redundancySummary(node);
  assert.equal(redundancy.headline, "Overlap");
  assert.equal(redundancy.detail, "Power BI and Dynamics 365 overlap");
  assert.doesNotMatch(redundancy.detail, /^Homebuyer Experience:/);
});
