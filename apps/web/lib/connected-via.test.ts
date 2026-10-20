import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MinEAObject, Relationship } from "@minea/types";
import { connectedVia, connectorHref } from "./connected-via.ts";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}) =>
  ({ id, type, name, properties, workspace_id: "w", org_id: "o", updated_at: "2026-10-20T00:00:00Z" }) as unknown as MinEAObject;
const rel = (id: string, type: string, from: [string, string], to: [string, string]) =>
  ({ id, type, from_object_id: from[0], from_type: from[1], to_object_id: to[0], to_type: to[1], attributes: {} }) as unknown as Relationship;

const A = obj("A", "application", "Billing");
const B = obj("B", "application", "CRM");
const C = obj("C", "solution", "Portal");
const view = (id: string, objects: MinEAObject[], rels: Relationship[]) =>
  connectedVia(id, objects, rels).map((l) => `${l.otherName} via ${l.viaLabel} ${l.viaName}: ${l.sentences.join(" / ")}`);

describe("connectedVia", () => {
  it("API: provider and consumers see each other, both directions", () => {
    const api = obj("X", "api", "Orders API");
    const rels = [rel("1", "exposes", ["A", "application"], ["X", "api"]), rel("2", "consumes", ["B", "application"], ["X", "api"]), rel("3", "consumes", ["C", "solution"], ["X", "api"])];
    assert.deepEqual(view("A", [A, B, C, api], rels), ["CRM via API Orders API: CRM consumes Orders API", "Portal via API Orders API: Portal consumes Orders API"]);
    assert.deepEqual(view("B", [A, B, C, api], rels), ["Billing via API Orders API: Billing exposes Orders API", "Portal via API Orders API: Portal consumes Orders API"]);
  });

  it("event: publisher and subscribers", () => {
    const ev = obj("E", "event", "Order placed");
    const rels = [rel("1", "publishes", ["A", "application"], ["E", "event"]), rel("2", "subscribes", ["B", "application"], ["E", "event"])];
    assert.deepEqual(view("A", [A, B, ev], rels), ["CRM via Event Order placed: CRM subscribes to Order placed"]);
    assert.deepEqual(view("B", [A, B, ev], rels), ["Billing via Event Order placed: Billing publishes Order placed"]);
  });

  it("flow: source and destination from the flow's own fields (v1 and v2)", () => {
    const v2 = obj("F", "integration_flow", "Nightly sync", {
      from: { endpoint_id: "A", endpoint_name: "Billing", endpoint_kind: "application" },
      to: { endpoint_id: "B", endpoint_name: "CRM", endpoint_kind: "application" },
    });
    const v1 = obj("G", "integration_flow", "Leads", { sources: { systems: [{ system_id: "B" }], entities: [] }, destinations: { systems: [{ system_id: "C" }], entities: [] } });
    assert.deepEqual(view("A", [A, B, C, v2, v1], []), ["CRM via Flow Nightly sync: CRM gets data from Nightly sync"]);
    assert.deepEqual(view("B", [A, B, C, v2, v1], []), [
      "Billing via Flow Nightly sync: Billing sends data to Nightly sync",
      "Portal via Flow Leads: Portal gets data from Leads",
    ]);
  });

  it("integration infra shared by apps", () => {
    const tool = obj("T", "tool", "MuleSoft");
    const rels = [rel("1", "connects_to", ["T", "tool"], ["A", "application"]), rel("2", "connects_to", ["T", "tool"], ["B", "application"])];
    assert.deepEqual(view("A", [A, B, tool], rels), ["CRM via Integration infra MuleSoft: MuleSoft connects to CRM"]);
  });

  it("data: writer and reader of one store, merged roles per app", () => {
    const store = obj("S", "data_store", "Warehouse");
    const rels = [
      rel("1", "writes", ["A", "application"], ["S", "data_store"]),
      rel("2", "reads", ["B", "application"], ["S", "data_store"]),
      rel("3", "owns", ["B", "application"], ["S", "data_store"]),
    ];
    assert.deepEqual(view("A", [A, B, store], rels), ["CRM via Data store Warehouse: CRM reads from Warehouse / CRM owns Warehouse"]);
    assert.deepEqual(view("B", [A, B, store], rels), ["Billing via Data store Warehouse: Billing writes to Warehouse"]);
  });

  it("skips lone participants, non-apps, deleted connectors and gateways", () => {
    const api = obj("X", "api", "Orders API");
    const gw = obj("T", "tool", "Kong");
    const comp = obj("K", "component", "Worker");
    const rels = [
      rel("1", "exposes", ["A", "application"], ["X", "api"]),
      rel("2", "exposes", ["K", "component"], ["X", "api"]),
      rel("3", "hosts", ["T", "tool"], ["X", "api"]),
      rel("4", "consumes", ["B", "application"], ["gone", "api"]),
    ];
    assert.deepEqual(view("A", [A, B, api, gw, comp], rels), []);
    assert.deepEqual(view("B", [A, B, api, gw, comp], rels), []);
  });

  it("links to the connector's list, opened on it", () => {
    assert.equal(connectorHref("/orgs/o/workspaces/w", "api", "X"), "/orgs/o/workspaces/w/integration/apis?open=X");
    assert.equal(connectorHref("/b", "data_object", "D"), "/b/data/data-objects?view=entities&open=D");
  });
});
