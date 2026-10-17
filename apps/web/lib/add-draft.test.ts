import assert from "node:assert/strict";
import { test } from "node:test";
import { ADD_DRAFT_TTL_MS, draftText, peekAddDraft, peekOrgDraft, restoreHref, saveAddDraft, takeAddDraft } from "./add-draft.ts";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

test("the waiting cards survive the trip to checkout and come back once", () => {
  const store = memory();
  saveAddDraft("acme", "default", ["Slack", " Zoom ", "", "HubSpot"], "/orgs/acme/workspaces/default/model/applications", store, 1000);
  const peeked = peekAddDraft("acme", "default", store, 2000)!;
  assert.equal(peeked.text, "Slack\nZoom\nHubSpot");
  assert.equal(peeked.count, 3);
  assert.equal(peeked.returnTo, "/orgs/acme/workspaces/default/model/applications?add=restore");
  assert.equal(peekOrgDraft("acme", store, 2000)?.count, 3);
  assert.equal(peekOrgDraft("other", store, 2000), null);
  assert.equal(takeAddDraft("acme", "default", store, 2000)?.count, 3);
  assert.equal(takeAddDraft("acme", "default", store, 2000), null);
});

test("old drafts and other workspaces don't come back", () => {
  const store = memory();
  saveAddDraft("acme", "default", ["Slack"], "/x", store, 0);
  assert.equal(peekAddDraft("acme", "other", store, 1), null);
  assert.equal(peekAddDraft("acme", "default", store, ADD_DRAFT_TTL_MS + 1), null);
  saveAddDraft("acme", "default", [], "/x", store, 0);
  assert.equal(peekAddDraft("acme", "default", store, 1), null);
});

test("restore link keeps the page's query", () => {
  assert.equal(restoreHref("/orgs/a/workspaces/b/setup?step=1"), "/orgs/a/workspaces/b/setup?step=1&add=restore");
  assert.equal(draftText(["a", "b"]), "a\nb");
});
