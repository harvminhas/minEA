import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { claimGoneRedirect, GONE_REDIRECT_KEY, httpStatusOf, isGoneError, lastPathAfterForgetting, retryUnlessClientError } from "./org-unavailable";
import { onForbiddenRefreshMembership, resetForbiddenRefreshThrottle } from "./membership-freshness";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("403/404 count as gone; network and 5xx don't", () => {
  assert.equal(httpStatusOf(new Error("404 Workspace not found (/orgs/a/workspaces/b)")), 404);
  assert.equal(isGoneError(new Error("403 Not a member of this org (/orgs/a)")), true);
  assert.equal(isGoneError(new Error("403 User not provisioned (/orgs/a)")), true);
  assert.equal(isGoneError(new Error("500 boom")), false);
  assert.equal(isGoneError(new Error("Failed to fetch")), false);
});

test("4xx is never retried; 5xx/network once", () => {
  assert.equal(retryUnlessClientError(0, new Error("403 x")), false);
  assert.equal(retryUnlessClientError(0, new Error("404 x")), false);
  assert.equal(retryUnlessClientError(0, new Error("503 x")), true);
  assert.equal(retryUnlessClientError(1, new Error("503 x")), false);
  assert.equal(retryUnlessClientError(0, new Error("Failed to fetch")), true);
});

test("forgetting clears only a remembered path inside the missing org/workspace", () => {
  assert.equal(lastPathAfterForgetting("/orgs/gone/workspaces/default/ask", "gone"), null);
  assert.equal(lastPathAfterForgetting("/orgs/keep/workspaces/default/ask", "gone"), "/orgs/keep/workspaces/default/ask");
  assert.equal(lastPathAfterForgetting("/orgs/a/workspaces/old/ask", "a", "old"), null);
  assert.equal(lastPathAfterForgetting("/orgs/a/workspaces/main/ask", "a", "old"), "/orgs/a/workspaces/main/ask");
  assert.equal(lastPathAfterForgetting(null, "a"), null);
});

test("one redirect per org: a second bounce within 15s stays put (no loop)", () => {
  const m = new Map<string, string>();
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(claimGoneRedirect("gone/", 1000, st), true);
  assert.equal(claimGoneRedirect("gone/", 5000, st), false);
  assert.equal(claimGoneRedirect("other/", 5000, st), true);
  assert.equal(claimGoneRedirect("gone/", 30000, st), true);
  assert.ok(m.has(GONE_REDIRECT_KEY));
});

test("a burst of 403s refreshes roles once, not once per error", () => {
  resetForbiddenRefreshThrottle();
  const qc = new QueryClient();
  const e = new Error("403 Not a member (/orgs/gone/x)");
  assert.equal(onForbiddenRefreshMembership(qc, e, ["a"], 10_000), true);
  assert.equal(onForbiddenRefreshMembership(qc, e, ["b"], 11_000), false);
  assert.equal(onForbiddenRefreshMembership(qc, e, ["c"], 16_000), true);
  resetForbiddenRefreshThrottle();
});

test("org and workspace layouts leave a gone org/workspace via /home; home can't hang", () => {
  assert.match(src("app/orgs/[orgSlug]/layout.tsx"), /useForgetGone\(\{ failed: orgLoadFailed/);
  const ws = src("app/orgs/[orgSlug]/workspaces/[workspaceSlug]/layout.tsx");
  assert.match(ws, /useForgetGone\(/);
  assert.match(ws, /retry: retryUnlessClientError/);
  assert.match(src("components/providers.tsx"), /retryUnlessClientError/);
  assert.match(src("app/home/page.tsx"), /resolvePostLoginDestination\([\s\S]*?\}\)\.catch\(/);
  assert.match(src("lib/use-forget-gone.ts"), /setLastAppPath\(lastPathAfterForgetting/);
});
