import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STILL_SAVING_MESSAGE, addSaveErrorMessage, batchKeyFor, batchSaved, maybeStillSaving } from "./add-batch-save.ts";
import { markAlreadySaved, prepareRows, type EstateItem } from "./setup/add-plan.ts";
import { addApi } from "./api-client.ts";

const body = (names: string[]) => JSON.stringify({ creates: names.map((name) => ({ key: name, type: "application", name, properties: {} })), updates: [], relationships: [] });

describe("batch Idempotency-Key", () => {
  it("reuses the key for the same items until they save, then starts a new one", () => {
    let n = 0;
    const make = () => `k${++n}`;
    const first = body(["Slack", "Zoom"]);
    assert.equal(batchKeyFor(first, 0, make), "k1");
    assert.equal(batchKeyFor(first, 1000, make), "k1", "a retry after a timeout sends the same key");
    assert.equal(batchKeyFor(body(["Slack"]), 1000, make), "k2", "different items, different key");
    batchSaved(first);
    assert.equal(batchKeyFor(first, 2000, make), "k3", "the same names added again later are a new save");
    batchSaved(first);
    batchSaved(body(["Slack"]));
  });

  it("forgets keys after 30 minutes", () => {
    let n = 0;
    const make = () => `old${++n}`;
    const b = body(["Teams"]);
    assert.equal(batchKeyFor(b, 0, make), "old1");
    assert.equal(batchKeyFor(b, 31 * 60 * 1000, make), "old2");
    batchSaved(b);
  });
});

describe("timeout / 5xx message", () => {
  it("treats 5xx and no response as maybe still saving", () => {
    assert.equal(maybeStillSaving(new Error("504 Gateway Timeout (/orgs/a/workspaces/default/objects/batch)")), true);
    assert.equal(maybeStillSaving(new Error("503 fetch failed (/x)")), true);
    assert.equal(maybeStillSaving(new TypeError("Failed to fetch")), true);
    assert.equal(maybeStillSaving(new Error("422 That relationship isn't allowed. (/x)")), false);
    assert.equal(maybeStillSaving(new Error("Not signed in")), false);
  });

  it("says to refresh instead of showing the raw 504", () => {
    assert.equal(addSaveErrorMessage(new Error("504 Gateway Timeout (/orgs/a/workspaces/default/objects/batch)")), STILL_SAVING_MESSAGE);
    assert.match(STILL_SAVING_MESSAGE, /Still saving/);
    assert.match(STILL_SAVING_MESSAGE, /[Rr]efresh before adding again/);
    assert.equal(addSaveErrorMessage(new Error("403 Your plan allows 50 records (/x)")), "403 Your plan allows 50 records (/x)");
  });
});

describe("addApi.save sends the key", () => {
  it("sends the same Idempotency-Key on a retry after a 504, and a new one after it saved", async () => {
    const seen: string[] = [];
    const replies = [
      new Response(JSON.stringify({ detail: "Gateway Timeout" }), { status: 504 }),
      new Response(JSON.stringify({ objects: [], relationships: [], created_object_ids: [], created_relationship_ids: [] }), { status: 200 }),
      new Response(JSON.stringify({ objects: [], relationships: [], created_object_ids: [], created_relationship_ids: [] }), { status: 200 }),
    ];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return replies.shift()!;
    }) as typeof fetch;
    try {
      const items = { creates: [{ key: "a", type: "application", name: "Asana", properties: {} }], updates: [], relationships: [] };
      await assert.rejects(addApi.save("org", "default", items, "t"), /^Error: 504/);
      await addApi.save("org", "default", items, "t");
      await addApi.save("org", "default", items, "t");
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(seen.length, 3, "a POST is never retried automatically");
    assert.ok(seen[0].length >= 8);
    assert.equal(seen[1], seen[0]);
    assert.notEqual(seen[2], seen[0]);
  });
});

describe("cards after a timed-out save", () => {
  it("cards whose records were saved show as already in the map", () => {
    const rows = prepareRows("Slack\nAcme Portal\nZoom", "app", []);
    assert.equal(rows.filter((row) => row.existing).length, 0);
    const saved = (id: string, name: string, catalogTool = ""): EstateItem => ({ id, type: "application", name, owner: "", cost: "", lifecycle: "", category: "", catalogTool, vendor: "", renewal: "" });
    const estate = [saved("1", "Slack", "slack"), saved("2", "Acme Portal")];
    const after = markAlreadySaved(rows, estate);
    const byName = Object.fromEntries(after.map((row) => [row.input, row.existing?.id ?? null]));
    assert.equal(byName["Slack"], "1");
    assert.equal(byName["Acme Portal"], "2");
    assert.equal(byName["Zoom"], null);
    assert.equal(markAlreadySaved(after, estate), after, "no change, same array (no re-render loop)");
  });
});
