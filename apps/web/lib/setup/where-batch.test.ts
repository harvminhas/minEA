import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sequentialRequestCount, serverIdsAfter, whereBatch, type WhereApp } from "./where-batch";

// ~7 apps on first ingestion: 4 Cloud, 1 desktop, 2 on servers (AS400 is new and "in the office",
// HV01 already exists), one app still "Don't know".
const apps: WhereApp[] = [
  { key: "m365", objectId: "o1", choice: "saas" }, { key: "slack", objectId: "o2", choice: "saas" },
  { key: "qbo", objectId: "o3", choice: "saas" }, { key: "sf", objectId: "o4", choice: "saas" },
  { key: "ps", objectId: "o5", choice: "desktop" }, { key: "erp", objectId: "o6", choice: "own" },
  { key: "edi", objectId: "o7", choice: "own" }, { key: "x", objectId: "o8", choice: "unknown" },
];
const servers = [{ key: "as400", name: "AS400", where: "Office" }, { key: "hv01", name: "HV01" }];
const links = [{ appKey: "erp", serverKey: "as400" }, { appKey: "edi", serverKey: "hv01" }];

test("step 3 is one batch with the same writes the old per-row save made", () => {
  const batch = whereBatch(servers, links, apps, { hv01: "srv-hv01" });
  assert.deepEqual(batch.creates.map((c) => `${c.type}:${c.name}`), ["model:AS400", "location:Office"]);
  assert.deepEqual(batch.relationships.map((r) => `${r.type}:${r.from_key ?? r.from_id}->${r.to_key ?? r.to_id}`), [
    "located_at:server:as400->location:as400",
    "runs_on:o6->server:as400",
    "runs_on:o7->srv-hv01",
  ]);
  assert.equal(batch.updates.length, 7);
  assert.ok(batch.updates.every((u) => u.overwrite));
  assert.deepEqual(batch.updates.find((u) => u.id === "o6")!.properties, { hosting_model: "on_premise" });
  // Before: 2 creates + 3 links + 7 PUTs = 12 sequential round trips (+1 refetch). After: 1 (+1 refetch).
  assert.equal(sequentialRequestCount(batch, apps), 12);
  assert.deepEqual(serverIdsAfter(batch, { hv01: "srv-hv01" }, ["new-as400", "new-loc"]), { hv01: "srv-hv01", as400: "new-as400" });
});

test("unchanged hosting isn't re-sent; existing servers are reused, never re-created or re-located", () => {
  const batch = whereBatch(servers, links, apps, { as400: "a", hv01: "h" }, { o1: "saas", o2: "saas", o3: "saas", o4: "saas", o5: "desktop" });
  assert.equal(batch.creates.length, 0);
  assert.deepEqual(batch.updates.map((u) => u.id), ["o6", "o7"]);
  assert.equal(batch.relationships.length, 2);
});

test("the wizard saves step 3 through one batch, one refetch, with a progress line", () => {
  const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  const save = src.slice(src.indexOf("const linkServers"), src.indexOf("const finish"));
  assert.equal((save.match(/addApi\.save\(/g) ?? []).length, 1);
  assert.doesNotMatch(save, /objectsApi\.|relationshipsApi\./);
  assert.equal((save.match(/invalidateQueries/g) ?? []).length, 1);
  assert.match(save, /Saving where/);
  assert.match(src, /if \(whereSave\.current\) await whereSave\.current;/);
});
