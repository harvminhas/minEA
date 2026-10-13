import assert from "node:assert/strict";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { memberActions } from "../../lib/member-actions.ts";

(globalThis as { React?: typeof React }).React = React;
let OrgMembersTable: typeof import("./OrgMembersTable.tsx").OrgMembersTable;
before(async () => {
  ({ OrgMembersTable } = await import("./OrgMembersTable.tsx"));
});

const m = (email: string, role: string) => ({ user_id: email, email, full_name: null, role, joined_at: "2026-01-01" });
const members = [m("me@x.io", "owner"), m("ad@x.io", "admin"), m("mem@x.io", "member")];
const render = (actorRole: string, actorEmail: string, list = members) =>
  renderToStaticMarkup(
    React.createElement(OrgMembersTable, {
      members: list as never,
      actorRole,
      actorEmail,
      onChangeRole: () => undefined,
      onRemove: () => undefined,
      onLeave: () => undefined,
    })
  );
const count = (h: string, id: string) => h.split(`data-testid="${id}"`).length - 1;

test("last owner: can't be demoted, removed, or leave", () => {
  const self = memberActions({ actorRole: "owner", isSelf: true, targetRole: "owner", ownerCount: 1 });
  assert.equal(self.canLeave, false);
  assert.match(self.reason ?? "", /only owner/);
  const other = memberActions({ actorRole: "owner", isSelf: false, targetRole: "owner", ownerCount: 1 });
  assert.deepEqual([other.roles, other.canRemove], [[], false]);
});

test("admins can't change owners or make owners", () => {
  const a = memberActions({ actorRole: "admin", isSelf: false, targetRole: "owner", ownerCount: 2 });
  assert.deepEqual([a.roles, a.canRemove], [[], false]);
  const b = memberActions({ actorRole: "admin", isSelf: false, targetRole: "member", ownerCount: 1 });
  assert.deepEqual(b.roles, ["admin", "member"]);
  assert.equal(b.canRemove, true);
  assert.deepEqual(memberActions({ actorRole: "owner", isSelf: false, targetRole: "member", ownerCount: 1 }).roles, ["owner", "admin", "member"]);
});

test("you can't remove yourself; Leave org instead (allowed when another owner exists)", () => {
  assert.equal(memberActions({ actorRole: "owner", isSelf: true, targetRole: "owner", ownerCount: 2 }).canLeave, true);
  assert.equal(memberActions({ actorRole: "member", isSelf: true, targetRole: "member", ownerCount: 1 }).canLeave, true);
  assert.equal(memberActions({ actorRole: "owner", isSelf: true, targetRole: "owner", ownerCount: 2 }).canRemove, false);
});

test("members get no actions on others", () => {
  const a = memberActions({ actorRole: "member", isSelf: false, targetRole: "member", ownerCount: 1 });
  assert.deepEqual([a.roles, a.canRemove], [[], false]);
});

test("owner view renders role selects and Remove for others, Leave (disabled) for the sole owner", () => {
  const h = render("owner", "me@x.io");
  assert.equal(count(h, "member-role-select"), 2);
  assert.equal(count(h, "member-remove"), 2);
  assert.equal(count(h, "member-leave"), 1);
  assert.match(h, /data-testid="member-leave" disabled=""/);
});

test("admin view: owner row is read-only", () => {
  const h = render("admin", "ad@x.io");
  assert.equal(count(h, "member-role-select"), 1);
  assert.equal(count(h, "member-remove"), 1);
  assert.match(h, /title="Only owners can change an owner"/);
});
