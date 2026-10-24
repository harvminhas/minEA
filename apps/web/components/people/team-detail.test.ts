import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let PersonPicker: typeof import("./PersonPicker.tsx").PersonPicker;
before(async () => {
  ({ PersonPicker } = await import("./PersonPicker.tsx"));
});

const people = [
  { id: "c2", name: "Raj Patel", team_name: "Platform", workspace_id: "w", org_id: "o", created_at: "", updated_at: "" },
  { id: "c1", name: "Ana Ruiz", title: "CFO", workspace_id: "w", org_id: "o", created_at: "", updated_at: "" },
];
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const pick = (props: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(PersonPicker, { people, label: "Team lead", onPick: () => {}, ...props } as never));

test("person picker: A–Z, a 'nobody' row, and a typed-in lead until replaced", () => {
  const html = pick({ value: null, legacyName: "Old Lead", noneLabel: "No lead", defaultOpen: true });
  assert.match(html, /Old Lead \(not in People\)/);
  assert.match(html, /No lead/);
  assert.ok(html.indexOf("Ana Ruiz") < html.indexOf("Raj Patel"));
  assert.doesNotMatch(pick({ value: "c2", legacyName: "Raj Patel" }), /not in People/);
});

test("person picker: a new name offers + New person, never a dead end", () => {
  const html = pick({ defaultOpen: true, defaultQuery: "Priya Shah" });
  assert.match(html, /No match in People/);
  assert.match(html, /New person “Priya Shah”/);
  assert.doesNotMatch(pick({ defaultOpen: true, defaultQuery: "ana ruiz" }), /New person/); // exact name exists
  const form = pick({ defaultOpen: true, defaultQuery: "Priya", defaultCreating: true, withTitle: "Title on this team", createLabel: "Create and add" });
  assert.match(form, /Email \(optional\)/);
  assert.match(form, /Title on this team \(optional\)/);
  assert.match(form, /Create and add/);
});

test("team page: members with titles, lead picker, owns; no Team roles section", () => {
  const team = src("./TeamDetailPanel.tsx");
  assert.match(team, /teamOwnedRows\(data\.items, teamId\)/);
  assert.match(team, /<BulkAssignDialog/);
  assert.match(team, /action: "move"/);
  assert.match(team, /peopleApi\.addTeamMember\(/);
  assert.match(team, /peopleApi\.updateTeamMember\(/);
  assert.match(team, /peopleApi\.removeTeamMember\(/);
  assert.match(team, /Title on this team/);
  assert.match(team, /lead_contact_id: id/);
  assert.match(team, /Also linked:/);
  assert.doesNotMatch(team, /Team roles|Select role|addTeamRole|Other accountabilities|LeadPicker/);
  const create = src("./CreateTeamPanel.tsx");
  assert.match(create, /lead_contact_id: leadContactId/);
  assert.match(create, /<PersonPicker/);
});

test("person page: inline edits, team chips, owns directly / via team, move everything", () => {
  const person = src("./PersonDetailPanel.tsx");
  for (const s of ['label="Title"', 'label="Email"', 'label="Phone"', "Add to team", '"Directly"', '"Via team (as lead)"', "Move everything to…", "<LeavingDialog"]) {
    assert.ok(person.includes(s), s);
  }
  const leaving = src("./LeavingDialog.tsx");
  assert.match(leaving, /action: "move"/);
  assert.match(leaving, /lead_contact_id: leads\[team\.id\]/);
  assert.match(leaving, /removeTeamMember/);
});

test("every person picker can add a new person (member, lead, owner fields)", () => {
  assert.match(src("../mvp/OwnershipCard.tsx"), /<PersonPicker/);
  assert.match(src("./LeavingDialog.tsx"), /<PersonPicker/);
  assert.match(src("./OwnershipRolesView.tsx"), /<PersonPicker/);
  assert.match(src("../ownership/OwnershipFields.tsx"), /Type a new name to add them to People/);
});

test("Roles are retired from the UI: nav, pages and the role forms are gone", () => {
  const sidebar = src("../mvp/ModelSidebar.tsx");
  assert.match(sidebar, /label: "People & teams"/);
  assert.ok(sidebar.indexOf('label: "People",') < sidebar.indexOf('label: "Teams",'));
  assert.doesNotMatch(sidebar, /label: "Roles"|label: "Contacts"/);
  const nav = src("../../lib/repository-nav.ts");
  assert.doesNotMatch(nav, /label: "Roles"|label: "Contacts"/);
  const rolesPage = src("../../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/people/roles/page.tsx");
  assert.match(rolesPage, /<PeopleTeamsHub tab="roles"/);
  assert.doesNotMatch(src("../org/PeopleTeamsPage.tsx"), /kind: "role"/);
  const roles = src("./OwnershipRolesView.tsx");
  assert.match(roles, /Old roles — review once/);
  assert.match(roles, /Make title of/);
  assert.match(roles, /retireRole\(/);
  const hub = src("./PeopleTeamsHub.tsx");
  assert.match(hub, /People \(\$\{data\.contacts\.length\}\)/);
  assert.match(hub, /Owns nothing/);
});
