import assert from "node:assert/strict";
import { before, test } from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { adminWorkspaces, canEditWorkspaceSettings, sidebarSettingsLink, workspaceSettingsPath } from "./workspace-admin.ts";

(globalThis as { React?: typeof React }).React = React;
let OrgSwitcherMenu: typeof import("../components/nav/OrgSwitcherMenu.tsx").OrgSwitcherMenu;
let NotOrgAdmin: typeof import("../components/org/OrgNotices.tsx").NotOrgAdmin;
before(async () => {
  ({ OrgSwitcherMenu } = await import("../components/nav/OrgSwitcherMenu.tsx"));
  ({ NotOrgAdmin } = await import("../components/org/OrgNotices.tsx"));
});

const ws = [
  { slug: "default", name: "Default workspace", role: "member" },
  { slug: "ops", name: "Ops", role: "admin" },
];

test("org member + workspace admin: can open that workspace's settings only", () => {
  assert.equal(canEditWorkspaceSettings("member", "admin"), true);
  assert.equal(canEditWorkspaceSettings("member", "member"), false);
  assert.deepEqual(adminWorkspaces(ws, "member").map((w) => w.slug), ["ops"]);
  assert.equal(workspaceSettingsPath("hmin", "ops"), "/orgs/hmin/workspaces/ops/settings");
});

test("plain member: no workspace settings anywhere", () => {
  assert.equal(canEditWorkspaceSettings("member", "viewer"), false);
  assert.deepEqual(adminWorkspaces(ws.map((w) => ({ ...w, role: "member" })), "member"), []);
  assert.deepEqual(sidebarSettingsLink({ orgSlug: "hmin", workspaceSlug: "default", canManageOrg: false, canManageWorkspace: false }), { href: "/orgs/hmin/settings", label: "Org settings" });
});

test("org admin: every workspace", () => {
  assert.equal(adminWorkspaces(ws, "admin").length, 2);
});

test("sidebar link goes to workspace settings for a workspace admin who isn't an org admin", () => {
  assert.deepEqual(sidebarSettingsLink({ orgSlug: "hmin", workspaceSlug: "ops", canManageOrg: false, canManageWorkspace: true }), {
    href: "/orgs/hmin/workspaces/ops/settings",
    label: "Workspace settings",
  });
  assert.equal(sidebarSettingsLink({ orgSlug: "hmin", workspaceSlug: "ops", canManageOrg: true, canManageWorkspace: true }).label, "Org settings");
});

const switcher = (role: string, list = ws) =>
  renderToStaticMarkup(
    React.createElement(OrgSwitcherMenu, {
      orgs: [{ slug: "hmin", name: "HMin Edomains", role }],
      workspacesByOrg: { hmin: list },
      currentOrgSlug: "hmin",
      currentWorkspaceSlug: "ops",
      onNavigate: () => undefined,
    })
  );

test("switcher shows a Workspace settings gear only on workspaces you admin", () => {
  const html = switcher("member");
  assert.equal(html.split('data-testid="switcher-ws-settings"').length - 1, 1);
  assert.match(html, /Workspace settings · Ops/);
  assert.equal(switcher("member", ws.map((w) => ({ ...w, role: "member" }))).includes("switcher-ws-settings"), false);
});

test("not-admin page lists the workspaces you admin, with links", () => {
  const html = renderToStaticMarkup(
    React.createElement(NotOrgAdmin, { orgName: "HMin Edomains", role: "member", askHref: null, adminOrgs: [], orgSlug: "hmin", adminWorkspaces: adminWorkspaces(ws, "member") })
  );
  assert.match(html, /Workspaces you admin in HMin Edomains/);
  assert.match(html, /href="\/orgs\/hmin\/workspaces\/ops\/settings"/);
  const plain = renderToStaticMarkup(
    React.createElement(NotOrgAdmin, { orgName: "HMin Edomains", role: "member", askHref: null, adminOrgs: [], orgSlug: "hmin", adminWorkspaces: [] })
  );
  assert.equal(plain.includes("not-org-admin-workspaces"), false);
});

test("entry points are wired: user menu, sidebar, org Workspaces list, not-admin page, ws General/Danger zone", () => {
  const top = readFileSync(new URL("../components/nav/TopNav.tsx", import.meta.url), "utf8");
  assert.match(top, /activeWorkspace\?\.slug && canManageWorkspace/);
  assert.match(readFileSync(new URL("../components/sidebar/AppSidebar.tsx", import.meta.url), "utf8"), /sidebarSettingsLink\(/);
  const org = readFileSync(new URL("../app/orgs/[orgSlug]/settings/page.tsx", import.meta.url), "utf8");
  assert.match(org, /adminWorkspaces=\{adminWorkspaces\(workspaces, org\.role\)\}/);
  assert.match(org, /canEditWorkspaceSettings\(org\?\.role, ws\.role\)/);
  const page = readFileSync(new URL("../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/settings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /hasPermission\("workspace\.delete"/);
  assert.match(page, /data-testid="ws-general"/);
});
