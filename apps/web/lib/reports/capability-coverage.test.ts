import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { MinEAObject, Relationship } from "@minea/types";
import { REPORT_REGISTRY } from "./home.ts";
import { capabilityCoverage, coverageCardCopy } from "./capability-coverage.ts";

function obj(
  id: string,
  type: string,
  name: string,
  properties: Record<string, unknown> = {},
): MinEAObject {
  return { id, type, name, properties } as MinEAObject;
}

function edge(from: string, to: string, fitness?: string): Relationship {
  return {
    id: `${from}-${to}`,
    type: "supported_by",
    from_object_id: from,
    to_object_id: to,
    attributes: fitness ? { fitness } : {},
  } as Relationship;
}

const domain = obj("d1", "business_domain", "Sell");
const covered = obj("c1", "capability", "Lead capture", { domain_id: "d1" });
const gap = obj("c2", "capability", "Handover", { domain_id: "d1" });
const weak = obj("c3", "capability", "Care", { domain_id: "d1" });
const activity = obj("a1", "capability", "Follow up", { domain_id: "d1", parent_id: "c3" });
const app = obj("app1", "application", "Salesforce");
const legacy = obj("app2", "application", "Legacy CRM");

test("an empty workspace uses the Add empty state, not a zero count", () => {
  const card = coverageCardCopy([], []);
  assert.equal(card.value, "No capability map yet");
  assert.equal(card.detail, "Add");
  assert.equal(capabilityCoverage([], []).empty, true);
});

test("the popular card reuses tree coverage and overview gaps", () => {
  const objects = [domain, covered, gap, app];
  const relationships = [edge("c1", "app1")];
  const model = capabilityCoverage(objects, relationships);
  assert.equal(model.empty, false);
  assert.equal(model.covered, 1);
  assert.equal(model.total, 2);
  assert.equal(model.card.value, "1 of 2 capabilities covered");
  assert.equal(model.card.detail, "1 with no system · Handover");
  assert.equal(model.noSystem.length, 1);
  assert.equal(model.noSystem[0]?.name, "Handover");
  assert.equal(model.noSystem[0]?.domain, "Sell");
  assert.equal(model.domains[0]?.meta, "1 of 2 covered");
  assert.match(model.lede, /1 of 2 capabilities has a system in place/);
  assert.match(model.lede, /1 has no system at all/);
});

test("partly covered, weak support, and a single app reuse tree fields", () => {
  const parent = obj("c3", "capability", "Care", { domain_id: "d1" });
  const uncovered = obj("a2", "capability", "Close out", { domain_id: "d1", parent_id: "c3" });
  const objects = [domain, parent, activity, uncovered, app, legacy];
  const relationships = [edge("c3", "app2", "weak"), edge("a1", "app1", "adequate")];
  const model = capabilityCoverage(objects, relationships);
  assert.equal(model.total, 1);
  assert.equal(model.partial.length, 1);
  assert.equal(model.partial[0]?.name, "Care");
  assert.match(model.partial[0]?.status ?? "", /1 of 2 activities/);
  assert.equal(model.weak[0]?.name, "Care");
  assert.equal(model.weak[0]?.status, "Legacy CRM is a weak fit");
  const oneAppParent = capabilityCoverage(
    [domain, covered, app],
    [edge("c1", "app1")],
  );
  assert.equal(oneAppParent.single.length, 1);
  assert.equal(oneAppParent.single[0]?.status, "Salesforce");
});

test("the report is registered under Risk & resilience and aging stays in the catalog", () => {
  const coverage = REPORT_REGISTRY.find((item) => item.id === "capability-coverage");
  const aging = REPORT_REGISTRY.find((item) => item.id === "aging");
  assert.ok(coverage);
  assert.equal(coverage?.category, "risk");
  assert.equal(coverage?.title, "Capability coverage");
  assert.ok(aging);
  assert.equal(aging?.category, "risk");
});

test("Ask home popular reports swap Aging for Capability coverage, without a one-off outline", () => {
  const ask = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(ask, /title="Capability coverage"/);
  assert.match(ask, /capability-coverage/);
  assert.doesNotMatch(
    ask,
    /title="Aging infrastructure"/,
  );
  const report = readFileSync(
    new URL("../../components/mvp/CapabilityCoverageReport.tsx", import.meta.url),
    "utf8",
  );
  assert.match(report, /CapabilityInterview/);
  assert.match(report, /Or add one capability yourself/);
  assert.doesNotMatch(report, /tile\.hi|hover:border-\[#c9c6f5\].*box-shadow: 0 0 0 1px #ece9ff/);
  assert.match(report, /buildCapabilityTree|capabilityCoverage/);
});
