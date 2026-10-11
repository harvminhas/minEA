import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { settingsRedirectFor } from "./settings-guard.ts";

const ws = [{ slug: "team" }, { slug: "default" }];

test("owners and admins stay on Org settings", () => {
  for (const role of ["owner", "admin"]) {
    assert.equal(settingsRedirectFor("acme", { slug: "acme", role }, ws), null, role);
  }
});

test("members and viewers go to their default workspace's Ask page", () => {
  for (const role of ["member", "viewer"]) {
    assert.equal(settingsRedirectFor("acme", { slug: "acme", role }, ws), "/orgs/acme/workspaces/default/ask", role);
  }
  assert.equal(settingsRedirectFor("acme", { slug: "acme", role: "member" }, []), null);
});

test("no decision until the org (with its role) and workspaces are loaded for this slug", () => {
  assert.equal(settingsRedirectFor("acme", undefined, ws), null);
  assert.equal(settingsRedirectFor("acme", { slug: "acme", role: "member" }, undefined), null);
  assert.equal(settingsRedirectFor("acme", { slug: "acme", role: null }, ws), null);
  assert.equal(settingsRedirectFor("acme", { slug: "other", role: "member" }, ws), null);
});

test("regression: the settings guard never reads the store's activeOrg role", () => {
  // The layout fills activeOrg in an effect that runs after the page's effects, so a guard
  // reading usePermissions().canManageOrg saw no role and bounced owners back to Ask.
  const src = readFileSync(new URL("../app/orgs/[orgSlug]/settings/page.tsx", import.meta.url), "utf8");
  const guard = src.slice(src.indexOf("settingsRedirectFor(orgSlug"), src.indexOf("settingsRedirectFor(orgSlug") + 200);
  assert.match(src, /const next = settingsRedirectFor\(orgSlug, org, workspaces\);/);
  assert.doesNotMatch(guard, /canManageOrg/);
  assert.doesNotMatch(src, /!canManageOrg && workspaces\.length/);
});
