import assert from "node:assert/strict";
import { before, test } from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let InviteDialog: typeof import("./InviteDialog.tsx").InviteDialog;
let InviteCard: typeof import("./InviteCard.tsx").InviteCard;
let NoWorkspace: typeof import("./NoWorkspace.tsx").NoWorkspace;
let PendingInviteRow: typeof import("./PendingInviteRow.tsx").PendingInviteRow;
let OrgMembersTable: typeof import("./OrgMembersTable.tsx").OrgMembersTable;
before(async () => {
  ({ InviteDialog } = await import("./InviteDialog.tsx"));
  ({ InviteCard } = await import("./InviteCard.tsx"));
  ({ NoWorkspace } = await import("./NoWorkspace.tsx"));
  ({ PendingInviteRow } = await import("./PendingInviteRow.tsx"));
  ({ OrgMembersTable } = await import("./OrgMembersTable.tsx"));
});
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (html: string, id: string) => html.split(`data-testid="${id}"`).length - 1;
const W = [{ slug: "main", name: "Main" }, { slug: "emea", name: "EMEA" }];
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("invite form: a role per workspace, role help as a tooltip, org admin only when allowed, preselected workspace", () => {
  const html = h(React.createElement(InviteDialog, { mode: "invite", workspaces: W, canInviteOrgAdmins: true, preselect: "emea", onClose: () => {} }));
  assert.equal(count(html, "invite-ws-check"), 2);
  assert.equal(count(html, "invite-ws-role"), 2);
  assert.match(html, /data-testid="role-help"[^>]*|title="Admin: manages/);
  assert.equal(count(html, "invite-org-admin"), 1);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1); // EMEA only
  const wsAdmin = h(React.createElement(InviteDialog, { mode: "invite", workspaces: [W[1]], canInviteOrgAdmins: false, onClose: () => {} }));
  assert.equal(count(wsAdmin, "invite-org-admin"), 0);
  assert.doesNotMatch(wsAdmin, />Main</); // only workspaces they admin
});

test("sent screen: Copy link per email; failed email says copy the link instead", () => {
  const issued = (email: string, sent: boolean) => ({ id: email, email, invite_url: `/invites/${email}`, email_sent: sent, merged: false, expires_at: "", org_admin: false, workspaces: [{ slug: "main", name: "Main", role: "member" as const }] });
  const html = h(React.createElement(InviteDialog, { mode: "invite", workspaces: W, canInviteOrgAdmins: false, onClose: () => {}, initialResult: [issued("a@x.io", true), issued("b@x.io", false)] }));
  assert.equal(count(html, "invite-copy-link"), 2);
  assert.match(html, /Invite emailed/);
  assert.match(html, /Email didn&#x27;t send — copy the link instead/);
});

test("edit on a member opens the same picker with their access", () => {
  const person = { email: "m@x.io", user_id: "u", org_role: "member", workspaces: [{ slug: "main", name: "Main", role: "viewer" as const }] };
  const html = h(React.createElement(InviteDialog, { mode: "edit", person, workspaces: W, canInviteOrgAdmins: false, onClose: () => {} }));
  assert.equal(count(html, "invite-emails"), 0);
  assert.match(html, /m@x\.io/);
  assert.match(html, /<option value="viewer" selected="">/);
  assert.match(html, />Save</);
});

test("accept page: inviter, workspaces and roles; already-in state with Open workspace", () => {
  const preview = { org_name: "Acme", org_slug: "acme", email: "a@x.io", role: "member", status: "pending", expired: false, consumed: false, inviter: "Sam Rivera", workspaces: [{ slug: "main", name: "Main", role: "member" as const }, { slug: "emea", name: "EMEA", role: "viewer" as const }] } as never;
  const html = h(React.createElement(InviteCard, { preview }));
  assert.match(html, /Sam Rivera/);
  assert.match(html, /EMEA<\/span><span[^>]*>Viewer/);
  const already = h(React.createElement(InviteCard, { preview, already: { href: "/orgs/acme/workspaces/main/ask", label: "Open workspace" } }));
  assert.match(already, /already in Acme/);
  assert.match(already, /Open workspace/);
});

test("no-workspace page: message, create link for admins only, org switcher", () => {
  const html = h(React.createElement(NoWorkspace, { orgSlug: "acme", orgName: "Acme", canCreate: false, otherOrgs: [{ slug: "b", name: "Beta", href: "/x" }] }));
  assert.match(html, /No workspace shared with you yet/);
  assert.equal(count(html, "no-workspace-create"), 0);
  assert.equal(count(html, "no-workspace-orgs"), 1);
  assert.equal(count(h(React.createElement(NoWorkspace, { orgSlug: "acme", canCreate: true })), "no-workspace-create"), 1);
});

test("pending rows: badge, Copy link only when copyable, Resend invite, Add to workspace", () => {
  const invite = { id: "i", email: "p@x.io", role: "member", expires_at: "2026-10-24", access: "Main · Member" };
  const row = (canCopy: boolean) =>
    h(React.createElement(PendingInviteRow, { invite: { ...invite, canCopy }, onResend: async () => "", onRevoke: () => {}, onCopyLink: async () => "", onAddAccess: () => {} }));
  assert.equal(count(row(true), "pending-badge"), 1);
  assert.equal(count(row(true), "invite-copy"), 1);
  assert.equal(count(row(false), "invite-copy"), 0);
  assert.match(row(true), /Resend invite/);
  assert.match(row(true), /Add to workspace/);
  assert.match(row(true), /Main · Member/);
});

test("members table: one row per person with access, Pending badge and Edit", () => {
  const html = h(
    React.createElement(OrgMembersTable, {
      members: [{ user_id: "u", email: "m@x.io", role: "member" }],
      actorRole: "owner",
      actorEmail: "me@x.io",
      onChangeRole: () => {},
      onRemove: () => {},
      onLeave: () => {},
      extra: () => ({ access: "Main · Viewer", pending: true, actions: React.createElement("button", { "data-testid": "member-edit-access" }, "Edit") }),
      after: React.createElement("div", { "data-testid": "invitee" }),
      headerAction: React.createElement("button", { "data-testid": "invite-open" }, "Invite people"),
    })
  );
  for (const id of ["member-access", "pending-badge", "member-edit-access", "invitee", "invite-open"]) assert.equal(count(html, id), 1, id);
});

test("all four Org-settings fallbacks now go to the no-workspace page", () => {
  for (const f of ["../../app/invites/[token]/page.tsx", "../../lib/org-access.ts", "../../lib/last-app-path.ts", "../../app/home/page.tsx"]) {
    const s = src(f);
    assert.doesNotMatch(s, /`\/orgs\/\$\{[\w.[\]!]+\}\/settings`/, f);
  }
  assert.match(src("../../lib/org-access.ts"), /no-workspace/);
  assert.match(src("../../lib/last-app-path.ts"), /no-workspace/);
  assert.match(src("../../app/home/page.tsx"), /no-workspace/);
  assert.match(src("../../app/invites/[token]/page.tsx"), /orgLandingPath/);
  assert.match(src("../../app/invites/[token]/page.tsx"), /result\.already/);
});

test("both settings pages drop the old invite forms and Pending invites sections", () => {
  for (const f of ["../../app/orgs/[orgSlug]/settings/page.tsx", "../../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/settings/page.tsx"]) {
    const s = src(f);
    assert.doesNotMatch(s, /Invite to (org|workspace)/);
    assert.doesNotMatch(s, /Pending invites<\/h2>/);
    assert.match(s, /people\.dialog/);
  }
});
