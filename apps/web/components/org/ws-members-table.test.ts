import assert from "node:assert/strict";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { countAdmins, workspaceMemberActions, LAST_WS_ADMIN_REASON } from "../../lib/member-actions.ts";

(globalThis as { React?: typeof React }).React = React;
let MembersTable: typeof import("./OrgMembersTable.tsx").MembersTable;
before(async () => {
  ({ MembersTable } = await import("./OrgMembersTable.tsx"));
});

test("last workspace admin: no demote, no remove, no leave", () => {
  const other = workspaceMemberActions({ canManage: true, isSelf: false, targetRole: "admin", adminCount: 1 });
  assert.deepEqual([other.roles, other.canRemove, other.reason], [[], false, LAST_WS_ADMIN_REASON]);
  const self = workspaceMemberActions({ canManage: true, isSelf: true, targetRole: "admin", adminCount: 1 });
  assert.deepEqual([self.roles, self.canLeave], [[], false]);
});

test("managers (org owner/admin or ws admin) get admin/member/viewer and Remove", () => {
  const a = workspaceMemberActions({ canManage: true, isSelf: false, targetRole: "member", adminCount: 1 });
  assert.deepEqual(a.roles, ["admin", "member", "viewer"]);
  assert.equal(a.canRemove, true);
  assert.equal(workspaceMemberActions({ canManage: true, isSelf: false, targetRole: "admin", adminCount: 2 }).canRemove, true);
});

test("non-managers get nothing on others but can leave themselves", () => {
  const a = workspaceMemberActions({ canManage: false, isSelf: false, targetRole: "viewer", adminCount: 1 });
  assert.deepEqual([a.roles, a.canRemove], [[], false]);
  const s = workspaceMemberActions({ canManage: false, isSelf: true, targetRole: "viewer", adminCount: 1 });
  assert.deepEqual([s.roles, s.canLeave, s.canRemove], [[], true, false]);
});

test("shared table renders the workspace wording", () => {
  const members = [
    { user_id: "1", email: "h@x.io", full_name: "Harvinder Minhas", role: "admin" },
    { user_id: "2", email: "e@x.io", full_name: "Edom Ains", role: "member" },
  ];
  const admins = countAdmins(members);
  const html = renderToStaticMarkup(
    React.createElement(MembersTable, {
      members,
      actorEmail: "h@x.io",
      onChangeRole: () => undefined,
      onRemove: () => undefined,
      onLeave: () => undefined,
      scope: {
        actionsFor: (m, isSelf) => workspaceMemberActions({ canManage: true, isSelf, targetRole: m.role, adminCount: admins }),
        removeLabel: "Remove",
        removeTitle: (n) => `Remove ${n} from this workspace?`,
        removeCopy: "",
        leaveLabel: "Leave workspace",
        leaveTitle: "",
        leaveCopy: "",
      },
    })
  );
  assert.match(html, /Leave workspace/);
  assert.match(html, /<option value="viewer">Viewer<\/option>/);
  assert.equal(html.split('data-testid="member-remove"').length - 1, 1);
  assert.equal(html.split('data-testid="member-role-select"').length - 1, 1, "sole admin's own role is locked");
});
