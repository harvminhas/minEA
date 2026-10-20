import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { onCatalogWrite, type CatalogWrite } from "./catalog-write-bus.ts";
import { catalogQueryKey, handleCatalogWrite, mergeFreshCatalog, shapeCatalog, type WorkspaceCatalog } from "./use-model-catalog.ts";
import { dataApi, objectsApi, relationshipsApi } from "./api-client.ts";
import { syncApiRelationships } from "./api-relationship-utils.ts";
import { connectedVia } from "./connected-via.ts";

const obj = (id: string, type: string, name: string) =>
  ({ id, type, name, properties: {}, workspace_id: "w", org_id: "o", updated_at: "2026-10-20T00:00:00Z" }) as unknown as MinEAObject;
const key = catalogQueryKey("org", "ws");
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeServer() {
  let n = 0;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${String(url).replace(/^.*\/workspaces\/ws/, "")}`);
    if (method === "GET" && String(url).includes("/relationships")) return new Response("[]", { status: 200 });
    if (method === "DELETE") return new Response(null, { status: 204 });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (String(url).includes("/relationships")) return Response.json({ id: `r${++n}`, attributes: {}, ...body }, { status: 201 });
    if (String(url).includes("/data/")) return method === "POST" && String(url).endsWith("/links") ? new Response(null, { status: 204 }) : Response.json({ id: "d1" });
    return Response.json({ id: body.type === "api" ? "X" : "N", workspace_id: "w", org_id: "o", updated_at: "2026-10-20T00:00:01Z", properties: {}, ...body }, { status: 201 });
  }) as typeof fetch;
  return calls;
}

function wired() {
  const qc = new QueryClient();
  qc.setQueryData(key, shapeCatalog({ objects: [obj("A", "application", "Billing"), obj("B", "application", "CRM")], relationships: [] }));
  const refetches: string[] = [];
  const off = onCatalogWrite((write) => handleCatalogWrite(qc, write, (k) => refetches.push(JSON.stringify(k))));
  return { qc, refetches, off, catalog: () => qc.getQueryData<WorkspaceCatalog>(key)! };
}

describe("catalog stays current after connector writes", () => {
  it("saving an API (create + sync) shows it on both apps without a reload", async () => {
    fakeServer();
    const { off, catalog, refetches } = wired();
    const api = await objectsApi.create("org", "ws", { type: "api", name: "Orders API", properties: {} } as never, "t");
    await syncApiRelationships("org", "ws", api.id, { provider_id: "A", provider_name: "Billing", provider_kind: "application" } as never, [{ consumer_id: "B", consumer_name: "CRM", consumer_kind: "application" }], null, "t");
    off();
    const c = catalog();
    assert.ok(c.objects.some((o) => o.id === "X"));
    assert.deepEqual(connectedVia("A", c.objects, c.relationships).map((l) => l.otherName), ["CRM"]);
    assert.deepEqual(connectedVia("B", c.objects, c.relationships).map((l) => l.otherName), ["Billing"]);
    assert.ok(refetches.length > 0, "a connector write also asks for a fresh catalog");
  });

  it("removing a consumer link and deleting the API drop them from the cache", async () => {
    fakeServer();
    const { off, qc, catalog } = wired();
    const api = await objectsApi.create("org", "ws", { type: "api", name: "Orders API", properties: {} } as never, "t");
    const link = await relationshipsApi.create("org", "ws", { type: "consumes", from_object_id: "B", from_type: "application", to_object_id: api.id, to_type: "api" }, "t");
    assert.equal(catalog().relationships.length, 1);
    await relationshipsApi.delete("org", "ws", link.id, "t");
    assert.equal(catalog().relationships.length, 0);
    await relationshipsApi.create("org", "ws", { type: "consumes", from_object_id: "B", from_type: "application", to_object_id: api.id, to_type: "api" }, "t");
    await objectsApi.delete("org", "ws", api.id, "t");
    off();
    assert.equal(catalog().relationships.length, 0);
    assert.ok(!catalog().objects.some((o) => o.id === "X"));
    assert.ok(qc.getQueryData(key));
  });

  it("data layer writes (no catalog rows returned) schedule a refetch", async () => {
    fakeServer();
    const { off, refetches } = wired();
    await dataApi.addStoreLink("org", "ws", "S", { entity_kind: "data_object", entity_id: "D", link_kind: "stores" }, "t");
    off();
    assert.equal(refetches.length, 1);
  });

  it("ordinary app edits are left to their own callers (no object write, no refetch)", async () => {
    fakeServer();
    const { off, refetches, catalog } = wired();
    await objectsApi.update("org", "ws", "A", { name: "Billing 2" } as never, "t");
    off();
    assert.equal(catalog().objects.find((o) => o.id === "A")?.name, "Billing");
    assert.equal(refetches.length, 0);
  });

  it("no cached catalog: nothing is invented", () => {
    const qc = new QueryClient();
    const write: CatalogWrite = { orgSlug: "org", workspaceSlug: "ws", object: obj("X", "api", "Orders API"), refetch: true };
    handleCatalogWrite(qc, write, () => assert.fail("no refetch without a catalog"));
    assert.equal(qc.getQueryData(key), undefined);
  });
});

describe("mergeFreshCatalog links", () => {
  const link = { id: "L", type: "consumes", from_object_id: "B", from_type: "application", to_object_id: "X", to_type: "api", attributes: {} } as unknown as Relationship;
  const objects = [obj("B", "application", "CRM"), obj("X", "api", "Orders API")];
  it("keeps a link this tab just wrote when the fetch lacks it, drops one the server removed", () => {
    const current = shapeCatalog({ objects, relationships: [link] });
    const fetched = shapeCatalog({ objects, relationships: [] });
    assert.equal(mergeFreshCatalog(current, fetched, () => false, () => true).relationships.length, 1);
    assert.equal(mergeFreshCatalog(current, fetched, () => false, () => false).relationships.length, 0);
  });
});
