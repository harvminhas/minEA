import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accessSummary,
  chosenWorkspaces,
  emailStatusText,
  higherRole,
  initialPicks,
  inviteFormError,
  noWorkspacePath,
  parseEmails,
  pendingOnlyRows,
  ROLE_HELP,
} from "./invite-form.ts";

const ws = (slug: string, role: "admin" | "member" | "viewer") => ({ slug, name: slug.toUpperCase(), role });

test("emails: split on commas, semicolons, spaces and lines; deduped; bad ones reported", () => {
  assert.deepEqual(parseEmails("A@x.io, b@x.io;\nb@x.io  nope"), { valid: ["a@x.io", "b@x.io"], invalid: ["nope"] });
});

test("form: needs an email and at least one workspace unless org admin", () => {
  assert.equal(inviteFormError({ emailsText: "", picks: {}, orgAdmin: false }), "Add at least one email");
  assert.equal(inviteFormError({ emailsText: "a@x.io", picks: {}, orgAdmin: false }), "Pick at least one workspace");
  assert.equal(inviteFormError({ emailsText: "a@x.io", picks: {}, orgAdmin: true }), null);
  assert.equal(inviteFormError({ emailsText: "a@x.io", picks: { main: "viewer" }, orgAdmin: false }), null);
  assert.match(inviteFormError({ emailsText: "a@x.io bad", picks: { main: "viewer" }, orgAdmin: false })!, /bad/);
  assert.equal(inviteFormError({ emailsText: "", picks: { main: "member" }, orgAdmin: false, mode: "edit" }), null);
});

test("picker order is the list's; never-downgrade helper keeps the higher role", () => {
  assert.deepEqual(chosenWorkspaces([{ slug: "b" }, { slug: "a" }], { a: "viewer", b: "admin" }), [
    { slug: "b", role: "admin" },
    { slug: "a", role: "viewer" },
  ]);
  assert.equal(higherRole("admin", "viewer"), "admin");
  assert.equal(higherRole("viewer", "member"), "member");
  assert.equal(higherRole(undefined, "viewer"), "viewer");
});

test("edit starts from current access merged with a pending invite; a workspace opener preselects", () => {
  const person = { email: "a@x.io", workspaces: [ws("main", "viewer")], invite: { id: "i", org_admin: false, workspaces: [ws("main", "member"), ws("emea", "viewer")], expires_at: "", can_copy: true, can_manage: true } };
  assert.deepEqual(initialPicks({ person }), { main: "member", emea: "viewer" });
  assert.deepEqual(initialPicks({ preselect: "ops" }), { ops: "member" });
});

test("labels: access summary, email status, role help tooltip, no-workspace path", () => {
  assert.equal(accessSummary({ workspaces: [ws("main", "member"), ws("emea", "viewer")] }), "MAIN · Member, EMEA · Viewer");
  assert.equal(accessSummary({ org_admin: true, workspaces: [] }), "Org admin · all workspaces");
  assert.equal(emailStatusText({ email_sent: false, merged: false }), "Email didn't send — copy the link instead");
  assert.equal(emailStatusText({ email_sent: true, merged: true }), "Invite updated and emailed");
  assert.match(ROLE_HELP, /Viewer: reads only/);
  assert.equal(noWorkspacePath("acme"), "/orgs/acme/no-workspace");
});

test("merged list: invitees get their own row; members with an invite don't; workspace pages filter", () => {
  const inv = (w: string[], admin = false) => ({ id: w.join(), org_admin: admin, workspaces: w.map((s) => ws(s, "member")), expires_at: "", can_copy: true, can_manage: true });
  const people = [
    { email: "m@x.io", org_role: "member", workspaces: [], invite: inv(["main"]) },
    { email: "i@x.io", workspaces: [], invite: inv(["emea"]) },
    { email: "a@x.io", workspaces: [], invite: inv([], true) },
  ];
  assert.deepEqual(pendingOnlyRows(people).map((p) => p.email), ["i@x.io", "a@x.io"]);
  assert.deepEqual(pendingOnlyRows(people, "main").map((p) => p.email), ["a@x.io"]);
});
