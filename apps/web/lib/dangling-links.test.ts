import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { applyCatalogWrite, catalogQueryKey, shapeCatalog, type WorkspaceCatalog } from "./use-model-catalog";
import { readPlatformInfra } from "./infra/read";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}) => ({ id, type, name, properties }) as unknown as MinEAObject;
const rel = (id: string, from: string, to: string) =>
  ({ id, type: "runs_on", from_object_id: from, from_type: "application", to_object_id: to, to_type: "cloud_service", attributes: {} }) as unknown as Relationship;

const mam = obj("mam", "cloud_service", "MAM", { platform_kind: "cloud_account", vendor: "microsoft" });
const compliance = obj("app1", "application", "MS Compliance");
const gone = obj("app2", "application", "Old app");

test("the catalogue never carries links whose end is not in it", () => {
  const shaped = shapeCatalog({ objects: [mam, compliance], relationships: [rel("r1", "app1", "mam"), rel("r2", "deleted-a", "mam"), rel("r3", "deleted-b", "mam")] });
  assert.deepEqual(shaped.relationships.map((r) => r.id), ["r1"]);
});

test("deleting a record also drops its links from the cached catalogue", () => {
  const client = new QueryClient();
  const key = catalogQueryKey("o", "w");
  client.setQueryData(key, shapeCatalog({ objects: [mam, compliance, gone], relationships: [rel("r1", "app1", "mam"), rel("r2", "app2", "mam")] }));
  applyCatalogWrite(client, "o", "w", { removeId: "app2" });
  const after = client.getQueryData<WorkspaceCatalog>(key)!;
  assert.deepEqual(after.relationships.map((r) => r.id), ["r1"]);
  assert.ok(!after.objects.some((o) => o.id === "app2"));
});

test("platform headers use the same derived kind as the list", () => {
  assert.equal(readPlatformInfra(mam).kindLabel, "Tenant · Azure");
  assert.equal(readPlatformInfra(obj("m365", "cloud_service", "Microsoft 365")).kindLabel, "SaaS suite · Microsoft 365");
});
