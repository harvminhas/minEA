import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { applyOverrides, friendlyError, runRowAction, type Overrides } from "./row-saving.ts";
import {
  MEMBERSHIP_QUERY,
  invalidateMembership,
  isMembershipKey,
  onForbiddenRefreshMembership,
} from "./membership-freshness.ts";

// ---- (1) saving state -------------------------------------------------------------------------
function harness() {
  let state: Overrides = {};
  const timers: (() => void)[] = [];
  const set = (fn: (p: Overrides) => Overrides) => (state = fn(state));
  return { get: () => state, set, timers, schedule: (fn: () => void) => timers.push(fn) };
}

test("role change: optimistic + Saving…, then Saved tick, then cleared", async () => {
  const h = harness();
  let resolve!: () => void;
  const p = runRowAction("u2", { role: "admin" }, () => new Promise<void>((r) => (resolve = r)), h.set, h.schedule);
  assert.equal(h.get().u2.status, "saving");
  const rows = applyOverrides([{ id: "u2", role: "member" }], (r) => r.id, h.get());
  assert.equal(rows[0].role, "admin", "new role shows immediately");
  resolve();
  assert.equal(await p, true);
  assert.equal(h.get().u2.status, "saved");
  h.timers.forEach((t) => t());
  assert.equal(h.get().u2, undefined);
});

test("failure rolls back with the API's message", async () => {
  const h = harness();
  const ok = await runRowAction(
    "u2",
    { role: "owner" },
    () => Promise.reject(new Error('403 {"detail":"Only owners can change an owner or make someone an owner"} (/orgs/x/members/u2/role)')),
    h.set,
    h.schedule
  );
  assert.equal(ok, false);
  assert.equal(h.get().u2.status, "error");
  assert.equal(h.get().u2.error, "Only owners can change an owner or make someone an owner");
  assert.equal(applyOverrides([{ id: "u2", role: "member" }], (r) => r.id, h.get())[0].role, "member");
});

test("remove/revoke: dims while saving, hides after success, comes back on failure", async () => {
  const h = harness();
  await runRowAction("i1", { removing: true }, async () => undefined, h.set, h.schedule);
  h.timers.forEach((t) => t());
  assert.equal(applyOverrides([{ id: "i1", role: "member" }], (r) => r.id, h.get()).length, 0);
  const h2 = harness();
  await runRowAction("i1", { removing: true }, () => Promise.reject(new Error("400 Invite is not pending (/x)")), h2.set, h2.schedule);
  assert.equal(applyOverrides([{ id: "i1", role: "member" }], (r) => r.id, h2.get()).length, 1);
  assert.equal(friendlyError(new Error("400 Invite is not pending (/x)")), "Invite is not pending");
});

test("both members tables and pending invites use the saving state", () => {
  const table = readFileSync(new URL("../components/org/OrgMembersTable.tsx", import.meta.url), "utf8");
  assert.match(table, /runRowAction\(m\.user_id, \{ role \}/);
  assert.match(table, /runRowAction\(m\.user_id, \{ removing: true \}/);
  assert.match(table, /Saving…/);
  const invite = readFileSync(new URL("../components/org/PendingInviteRow.tsx", import.meta.url), "utf8");
  assert.match(invite, /onResend/);
  // Pending invites are rows in the merged Members list (PeoplePanel), on both settings pages.
  assert.match(readFileSync(new URL("../components/org/PeoplePanel.tsx", import.meta.url), "utf8"), /<PendingInviteRow/);
  for (const page of ["../app/orgs/[orgSlug]/settings/page.tsx", "../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/settings/page.tsx"]) {
    const src = readFileSync(new URL(page, import.meta.url), "utf8");
    assert.match(src, /usePeoplePanel\(/);
    assert.match(src, /after=\{people\.after\}/);
    assert.match(src, /memberMutation\.mutateAsync\(\{ kind: "role"/);
    assert.match(src, /setQueryData\(/);
  }
});

// ---- (2) stale role ---------------------------------------------------------------------------
test("repro: with the old 60s staleTime a mounted observer keeps the cached 'member' role", async () => {
  let role = "member";
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  const fn = async () => ({ slug: "hmin", role });
  await qc.fetchQuery({ queryKey: ["org", "hmin"], queryFn: fn });
  role = "admin"; // promoted in the DB
  const old = new QueryObserver(qc, { queryKey: ["org", "hmin"], queryFn: fn });
  const un = old.subscribe(() => undefined);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal((qc.getQueryData(["org", "hmin"]) as { role: string }).role, "member", "bug: stale role");
  un();
});

test("fix: membership queries refetch on mount and on navigation (invalidate)", async () => {
  let role = "member";
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  const fn = async () => ({ slug: "hmin", role });
  await qc.fetchQuery({ queryKey: ["org", "hmin"], queryFn: fn });
  role = "admin";
  const obs = new QueryObserver(qc, { queryKey: ["org", "hmin"], queryFn: fn, ...MEMBERSHIP_QUERY });
  const un = obs.subscribe(() => undefined);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal((qc.getQueryData(["org", "hmin"]) as { role: string }).role, "admin");
  role = "member";
  await invalidateMembership(qc, "hmin");
  assert.equal((qc.getQueryData(["org", "hmin"]) as { role: string }).role, "member");
  un();
});

test("a 403 elsewhere refreshes roles, but a failing role query doesn't loop", () => {
  const qc = new QueryClient();
  assert.equal(onForbiddenRefreshMembership(qc, new Error("403 Permission denied (/orgs/hmin/members)"), ["members", "hmin"]), true);
  assert.equal(onForbiddenRefreshMembership(qc, new Error("403 Not a member (/orgs/hmin)"), ["org", "hmin"]), false);
  assert.equal(onForbiddenRefreshMembership(qc, new Error("500 boom (/x)"), ["members", "hmin"]), false);
  assert.ok(isMembershipKey(["orgs"]) && isMembershipKey(["workspace", "a", "b"]) && !isMembershipKey(["members", "a"]));
});

test("every role-carrying query uses MEMBERSHIP_QUERY; layout refetches on navigation; 403 hook installed", () => {
  const files: Record<string, number> = {
    "../app/orgs/[orgSlug]/layout.tsx": 1,
    "../components/nav/TopNav.tsx": 2,
    "../components/ui/AppBootGate.tsx": 1,
    "../app/orgs/[orgSlug]/settings/page.tsx": 2,
    "../app/orgs/[orgSlug]/workspaces/new/page.tsx": 1,
    "../app/home/page.tsx": 1,
  };
  for (const [f, n] of Object.entries(files)) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.equal(src.split("...MEMBERSHIP_QUERY").length - 1, n, f);
  }
  assert.match(readFileSync(new URL("../app/orgs/[orgSlug]/layout.tsx", import.meta.url), "utf8"), /invalidateMembership\(queryClient, orgSlug\)/);
  assert.match(readFileSync(new URL("../components/providers.tsx", import.meta.url), "utf8"), /onForbiddenRefreshMembership/);
  assert.match(readFileSync(new URL("../app/orgs/[orgSlug]/settings/page.tsx", import.meta.url), "utf8"), /notAdminOf\(org\) && orgFetching/);
});
