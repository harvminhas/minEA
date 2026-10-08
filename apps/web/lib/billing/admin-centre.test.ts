import assert from "node:assert/strict";
import { test } from "node:test";
import { adminTabHref, resolveAdminTab } from "./admin-centre.ts";

test("flag off: no tabs, every settings section shows as before", () => {
  assert.equal(resolveAdminTab("billing", false), null);
  assert.equal(resolveAdminTab(null, false), null);
});

test("flag on: known tabs, anything else falls back to General", () => {
  assert.equal(resolveAdminTab("billing", true), "billing");
  assert.equal(resolveAdminTab("licences", true), "licences");
  assert.equal(resolveAdminTab(null, true), "general");
  assert.equal(resolveAdminTab("stripe", true), "general");
});

test("tab links keep the dev preview", () => {
  assert.equal(adminTabHref("qa-sso-test", "general"), "/orgs/qa-sso-test/settings");
  assert.equal(adminTabHref("qa-sso-test", "billing"), "/orgs/qa-sso-test/settings?tab=billing");
  assert.equal(
    adminTabHref("qa-sso-test", "licences", "team"),
    "/orgs/qa-sso-test/settings?tab=licences&preview=team"
  );
});
