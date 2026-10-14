import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIRECTORY_FIELDS, deleteWarning, filterRows } from "./PeopleTeamsPage";

test("search covers name, email, title and team", () => {
  const rows = [{ id: "1", name: "Chris B", usage: 2, email: "chris@x.com", team_name: "Sales" }, { id: "2", name: "Ann", usage: 0, title: "CFO" }];
  assert.deepEqual(filterRows(rows, "sales").map((row) => row.id), ["1"]);
  assert.deepEqual(filterRows(rows, "cfo").map((row) => row.id), ["2"]);
  assert.equal(filterRows(rows, "").length, 2);
});

test("delete warns with the usage count", () => {
  assert.match(deleteWarning({ id: "1", name: "Sales", usage: 3 }, "team"), /used 3 times/);
  assert.match(deleteWarning({ id: "1", name: "Ann", usage: 0 }, "person"), /Nothing uses this person/);
});

test("people carry email, phone, title and notes; the page is org-admin only and linked from org settings", () => {
  assert.deepEqual(DIRECTORY_FIELDS.person.map((field) => field.key), ["email", "phone", "title", "notes"]);
  const src = readFileSync(new URL("./PeopleTeamsPage.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(!isOrgAdmin\)/);
  assert.match(src, /peopleDirectoryApi\.merge/);
  const settings = readFileSync(new URL("../../app/orgs/[orgSlug]/settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /settings\/people/);
});
