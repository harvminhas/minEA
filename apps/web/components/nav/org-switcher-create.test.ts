import assert from "node:assert/strict";
import { before, test } from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let mod: typeof import("./OrgSwitcherMenu.tsx");
before(async () => {
  mod = await import("./OrgSwitcherMenu.tsx");
});

const render = (role: string, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(mod.OrgSwitcherMenu, {
      orgs: [{ slug: "hmin", name: "HMin Edomains", role }, { slug: "other", name: "Other Co", role: "owner" }],
      workspacesByOrg: { hmin: [{ slug: "default", name: "Default workspace" }], other: [] },
      currentOrgSlug: "hmin",
      currentWorkspaceSlug: "default",
      onNavigate: () => undefined,
      ...extra,
    })
  );
const count = (html: string, id: string) => html.split(`data-testid="${id}"`).length - 1;

test("every signed-in user can create a new organisation", () => {
  for (const role of ["owner", "admin", "member"]) assert.equal(count(render(role), "switcher-new-org"), 1, role);
  assert.match(render("member"), /Create new organisation/);
  assert.equal(mod.NEW_ORG_PATH, "/onboarding");
});

test("New workspace only where the user is owner/admin (API: workspace.create); members get a hint", () => {
  assert.equal(mod.canCreateWorkspaceIn("owner"), true);
  assert.equal(mod.canCreateWorkspaceIn("admin"), true);
  assert.equal(mod.canCreateWorkspaceIn("member"), false);
  const member = render("member");
  assert.equal(count(member, "switcher-new-workspace"), 1, "only under Other Co, where they are owner");
  assert.equal(count(member, "switcher-member-hint"), 1);
  const owner = render("owner");
  assert.equal(count(owner, "switcher-new-workspace"), 2);
  assert.equal(count(owner, "switcher-member-hint"), 0);
});

test("a plan limit on the current org shows the reason instead of New workspace", () => {
  const html = render("owner", { workspaceBlocked: { message: "Free plan: 1 workspace", planHref: "/orgs/hmin/settings" } });
  assert.equal(count(html, "switcher-workspace-blocked"), 1);
  assert.equal(count(html, "switcher-new-workspace"), 1);
});

test("the API lets any signed-in user create an org and limits workspace creation to workspace.create", () => {
  const orgs = readFileSync(new URL("../../../api/app/routers/orgs.py", import.meta.url), "utf8");
  assert.match(orgs, /Public signup: user creates org and becomes Owner/);
  const ws = readFileSync(new URL("../../../api/app/routers/workspaces.py", import.meta.url), "utf8");
  assert.match(ws, /require_permission\(db, "workspace\.create"\)/);
});
