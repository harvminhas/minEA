import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLicenceRoster,
  canAssignLicence,
  holdsLicence,
  licenceStatusFor,
  licencesUsedLabel,
  summarizeLicences,
  workspaceRoleLabel,
} from "./licences.ts";

test("licence holders are owner, admins and workspace editors", () => {
  assert.equal(licenceStatusFor("owner", []), "owner");
  assert.equal(licenceStatusFor("admin", []), "admin");
  assert.equal(licenceStatusFor("member", ["viewer", "member"]), "editor");
  assert.equal(licenceStatusFor("member", ["admin"]), "editor");
  assert.equal(licenceStatusFor("member", ["viewer"]), "viewer");
  assert.equal(licenceStatusFor("member", []), "no_access");
  assert.deepEqual(
    (["owner", "admin", "editor", "viewer", "no_access"] as const).map(holdsLicence),
    [true, true, true, false, false]
  );
});

test("roster joins org and workspace roles and sorts licence holders first", () => {
  const rows = buildLicenceRoster(
    [
      { user_id: "v", email: "v@x.com", full_name: "Vic", role: "member" },
      { user_id: "o", email: "o@x.com", full_name: "Olu", role: "owner" },
      { user_id: "e", email: "e@x.com", full_name: null, role: "member" },
      { user_id: "n", email: "n@x.com", full_name: "Nia", role: "member" },
    ],
    [
      { slug: "default", name: "Default", members: [{ user_id: "v", role: "viewer" }, { user_id: "e", role: "viewer" }] },
      { slug: "infra", name: "Infra", members: [{ user_id: "e", role: "member" }] },
    ]
  );
  assert.deepEqual(
    rows.map((r) => [r.userId, r.status, r.hasLicence]),
    [
      ["o", "owner", true],
      ["e", "editor", true],
      ["v", "viewer", false],
      ["n", "no_access", false],
    ]
  );
  assert.equal(rows[1]!.name, "e@x.com");
  assert.deepEqual(rows[1]!.workspaces.map((w) => w.slug), ["default", "infra"]);
});

test("licence cap: assign allowed below the pack size, disabled at it", () => {
  const team3 = summarizeLicences(3, 5);
  assert.deepEqual(team3, { used: 3, total: 5, available: 2, atCap: false, overCap: false });
  assert.equal(canAssignLicence(team3), true);

  const starterFull = summarizeLicences(1, 1);
  assert.equal(starterFull.atCap, true);
  assert.equal(canAssignLicence(starterFull), false);

  const over = summarizeLicences(7, 5);
  assert.equal(over.overCap, true);
  assert.equal(over.available, 0);
  assert.equal(canAssignLicence(over), false);
});

test("legacy orgs have no pack cap", () => {
  const legacy = summarizeLicences(14, null);
  assert.equal(legacy.total, null);
  assert.equal(canAssignLicence(legacy), true);
  assert.equal(licencesUsedLabel(legacy), "14 licences in use");
});

test("used labels", () => {
  assert.equal(licencesUsedLabel(summarizeLicences(1, 1)), "1 of 1 licence used");
  assert.equal(licencesUsedLabel(summarizeLicences(3, 5)), "3 of 5 licences used");
  assert.equal(licencesUsedLabel(summarizeLicences(1, null)), "1 licence in use");
});

test("workspace role labels call members editors", () => {
  assert.equal(workspaceRoleLabel("member"), "editor");
  assert.equal(workspaceRoleLabel("admin"), "admin");
  assert.equal(workspaceRoleLabel("viewer"), "viewer");
});
