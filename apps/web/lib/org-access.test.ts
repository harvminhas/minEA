import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activeTopNavTab,
  firstWorkspace,
  isOrgAdminRole,
  notAdminOf,
  orgLandingPath,
  orgLoadErrorMessage,
  orgSettingsLabel,
  otherAdminOrgs,
  roleLabel,
} from "./org-access.ts";
import { NotOrgAdmin, OrgLoadError } from "../components/org/OrgNotices.tsx";
import { OrgSwitcherMenu } from "../components/nav/OrgSwitcherMenu.tsx";

(globalThis as any).React = React;
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("roles: labels and who counts as an org admin", () => {
  assert.deepEqual(["owner", "admin", "member", "viewer"].map(roleLabel), ["Owner", "Admin", "Member", "Viewer"]);
  assert.equal(isOrgAdminRole("owner"), true);
  assert.equal(isOrgAdminRole("admin"), true);
  assert.equal(isOrgAdminRole("member"), false);
  assert.equal(notAdminOf({ role: "member" }), true);
  assert.equal(notAdminOf({ role: "viewer" }), true);
  assert.equal(notAdminOf({ role: "owner" }), false);
  assert.equal(notAdminOf(undefined), false, "no message before the org (and its role) loads");
});

test("other orgs this user can manage, excluding the current one", () => {
  const orgs = [
    { slug: "acme", name: "Acme", role: "member" },
    { slug: "zeta", name: "Zeta", role: "admin" },
    { slug: "own", name: "Bubo Labs", role: "owner" },
    { slug: "v", name: "Viewers Inc", role: "viewer" },
  ];
  assert.deepEqual(otherAdminOrgs(orgs, "acme").map((o) => o.slug), ["own", "zeta"]);
  assert.deepEqual(otherAdminOrgs(orgs, "own").map((o) => o.slug), ["zeta"]);
  assert.deepEqual(otherAdminOrgs(undefined, "acme"), []);
});

test("switching org lands on that org's first workspace Ask", () => {
  assert.equal(orgLandingPath("acme", [{ slug: "x" }, { slug: "default" }]), "/orgs/acme/workspaces/default/ask");
  assert.equal(orgLandingPath("acme", [{ slug: "x" }]), "/orgs/acme/workspaces/x/ask");
  assert.equal(firstWorkspace([]), undefined);
});

test("avatar menu label names the org", () => {
  assert.equal(orgSettingsLabel("Acme"), "Org settings · Acme");
  assert.equal(orgSettingsLabel(undefined), "Org settings");
});

test("top nav: org settings highlights no tab; workspace pages keep theirs", () => {
  assert.equal(activeTopNavTab("/orgs/acme/settings"), null);
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/new"), null);
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/settings"), null);
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/ask"), "ask");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/ask/answer"), "ask");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/reports"), "reports");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/views"), "views");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/views/processes"), "model");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/views/investments"), "model");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/views/capability-heatmap"), "model");
  assert.equal(activeTopNavTab("/orgs/acme/workspaces/main/model/overview"), "model");
});

test("org load errors explain without naming another org", () => {
  assert.match(orgLoadErrorMessage(new Error("403 Not a member of this org (/orgs/x)")), /isn't available to your account/);
  assert.match(orgLoadErrorMessage(new Error("Failed to fetch")), /couldn't load this organisation/);
});

test("not-admin message: org name, role, back to Ask, links to orgs they manage", () => {
  const html = renderToStaticMarkup(
    React.createElement(NotOrgAdmin, {
      orgName: "Acme",
      role: "member",
      askHref: "/orgs/acme/workspaces/default/ask",
      adminOrgs: [{ slug: "own", name: "Bubo Labs", role: "owner" }],
    })
  );
  assert.match(html, /You&#x27;re not an admin of Acme/);
  assert.match(html, /Only owners and admins can open org settings/);
  assert.match(html, /data-testid="not-org-admin-role"[^>]*>Member</);
  assert.match(html, /href="\/orgs\/acme\/workspaces\/default\/ask"[^>]*>.*Back to Acme/);
  assert.match(html, /href="\/orgs\/own\/settings"[^>]*>Org settings · Bubo Labs</);
  const alone = renderToStaticMarkup(React.createElement(NotOrgAdmin, { orgName: "Acme", role: "viewer", askHref: null, adminOrgs: [] }));
  assert.doesNotMatch(alone, /not-org-admin-other-orgs/);
  assert.match(alone, />Viewer</);
});

test("org load error offers a retry and a way home", () => {
  const html = renderToStaticMarkup(React.createElement(OrgLoadError, { message: "x", onRetry: () => {} }));
  assert.match(html, /Try again/);
  assert.match(html, /href="\/home"/);
});

test("switcher lists every org with its role and workspaces, current marked", () => {
  const html = renderToStaticMarkup(
    React.createElement(OrgSwitcherMenu, {
      orgs: [
        { slug: "own", name: "Bubo Labs", role: "owner" },
        { slug: "acme", name: "Acme", role: "member" },
      ],
      workspacesByOrg: { acme: [{ slug: "default", name: "Default" }], own: [{ slug: "main", name: "Main" }, { slug: "lab", name: "Lab" }] },
      currentOrgSlug: "acme",
      currentWorkspaceSlug: "default",
      onNavigate: () => {},
    })
  );
  assert.equal((html.match(/data-testid="org-switcher-org"/g) ?? []).length, 2);
  assert.ok(html.indexOf("Acme") < html.indexOf("Bubo Labs"), "current org first");
  assert.match(html, /Acme<\/span><span[^>]*data-testid="org-role-badge"[^>]*>Member</);
  assert.match(html, /Bubo Labs<\/span><span[^>]*data-testid="org-role-badge"[^>]*>Owner</);
  assert.match(html, />Current</);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  for (const ws of ["Default", "Main", "Lab"]) assert.match(html, new RegExp(`>${ws}<`));
});

test("wiring: settings page shows the message instead of redirecting; layout no longer jumps to /home", () => {
  const page = src("../app/orgs/[orgSlug]/settings/page.tsx");
  assert.doesNotMatch(page, /settingsRedirectFor/);
  assert.match(page, /if \(org && notAdminOf\(org\)\)/);
  assert.match(page, /if \(!token\) throw new Error\("Not signed in"\);\s+return orgsApi\.get\(orgSlug, token\)/);
  const layout = src("../app/orgs/[orgSlug]/layout.tsx");
  assert.doesNotMatch(layout, /router\.replace\("\/home"\)/);
  assert.match(layout, /<OrgLoadError/);
  const nav = src("../components/nav/TopNav.tsx");
  assert.match(nav, /orgSettingsLabel\(orgName\)/);
  assert.match(nav, /<OrgSwitcherMenu/);
  assert.match(nav, /const selected = activeTab === tab\.id;/);
});
