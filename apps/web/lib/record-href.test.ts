import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObjectType } from "@minea/types";
import { recordOpenPath } from "./record-href";

const o = (id: string, type: string, name = id, properties: Record<string, unknown> = {}) => ({
  id,
  type,
  name,
  properties,
});

const row = (id: string, type: string, properties: Record<string, unknown> = {}, kind?: string) => ({
  id,
  kind,
  object: { id, type, properties },
});

const BASE = "/ws";

test("capability links open the full-width detail page, not Servers & devices", () => {
  const objects = [
    o("fin", "business_domain", "Finance"),
    o("ap", "capability", "Accounts Payable", { domain_id: "fin" }),
    o("inv", "capability", "Invoice capture", { domain_id: "fin", parent_id: "ap" }),
  ];
  assert.equal(recordOpenPath(BASE, row("ap", "capability", { domain_id: "fin" }), objects), "/ws/model/capabilities/ap");
  assert.equal(
    recordOpenPath(BASE, row("inv", "capability", { domain_id: "fin", parent_id: "ap" }), objects),
    "/ws/model/capabilities/ap?activity=inv",
  );
});

test("an activity still opens the parent page when only the catalogue supplies parent_id", () => {
  const objects = [
    o("ap", "capability", "Accounts Payable", { domain_id: "fin" }),
    o("inv", "capability", "Invoice capture", { domain_id: "fin", parent_id: "ap" }),
  ];
  // Ask's factsFromItem builds a row with empty properties — look the activity up in the catalogue.
  const askRow = { id: "inv", kind: "runtime", object: { id: "inv", type: "capability", properties: {} } };
  assert.equal(recordOpenPath(BASE, askRow, objects), "/ws/model/capabilities/ap?activity=inv");
});

test("an activity with no parent recorded still opens the capability section (the page redirects)", () => {
  assert.equal(recordOpenPath(BASE, row("inv", "capability")), "/ws/model/capabilities/inv");
});

test("domain links open the capability map focused on that domain", () => {
  assert.equal(recordOpenPath(BASE, row("fin", "business_domain")), "/ws/model/capabilities?domain=fin");
  assert.equal(recordOpenPath(BASE, row("no-domain", "business_domain")), "/ws/model/capabilities");
});

test("every other object type goes to its own page, not a servers fallthrough", () => {
  const expected: Partial<Record<ObjectType, string | null>> = {
    application: "/ws/model/applications/id",
    solution: "/ws/model/applications/id",
    technical_capability: "/ws/model/applications/id",
    cloud_service: "/ws/model/platforms/id",
    model: "/ws/model/servers/id",
    agent: "/ws/model/agents/id",
    ai_model: "/ws/model/ai-models/id",
    location: "/ws/model/locations/id",
    external_party: "/ws/model/vendors/id",
    tool: "/ws/integration/tools?open=id",
    api: "/ws/integration/apis?open=id",
    event: "/ws/integration/events?open=id",
    integration_flow: "/ws/integration/flows?open=id",
    data_store: "/ws/data/data-stores?open=id",
    data_object: "/ws/data/data-objects?view=entities&open=id",
    // No dedicated record page — must not open /model/servers/id
    component: null,
    value_stream: null,
    roadmap_item: null,
    data_domain: null,
    message_broker: null,
    tech_debt: null,
    capability: "/ws/model/capabilities/id",
    business_domain: "/ws/model/capabilities?domain=id",
  };
  for (const [type, href] of Object.entries(expected)) {
    assert.equal(recordOpenPath(BASE, row("id", type)), href, type);
    if (type !== "model" && href) {
      assert.doesNotMatch(href, /\/model\/servers\//, `${type} must not fall through to servers`);
    }
  }
});

test("catalogue kind still routes apps, platforms, and servers when the object type is missing", () => {
  assert.equal(recordOpenPath(BASE, { id: "a", kind: "application" }), "/ws/model/applications/a");
  assert.equal(recordOpenPath(BASE, { id: "p", kind: "platform" }), "/ws/model/platforms/p");
  assert.equal(recordOpenPath(BASE, { id: "s", kind: "runtime" }), "/ws/model/servers/s");
});

test("Ask's old fallback — capability typed as runtime kind — no longer opens servers", () => {
  const askRow = { id: "ap", kind: "runtime" as const, object: { id: "ap", type: "capability", properties: {} } };
  assert.equal(recordOpenPath(BASE, askRow), "/ws/model/capabilities/ap");
  assert.notEqual(recordOpenPath(BASE, askRow), "/ws/model/servers/ap");
});
