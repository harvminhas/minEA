import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObjectOwnership, Team } from "@minea/types";
import { alsoLinked, canCreatePerson, handoverSummary, matchPeople, memberCount, personOwns, teamsLedBy, teamsOf, titleSuggestion } from "./people.ts";

const p = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, workspace_id: "w", org_id: "o", created_at: "", updated_at: "", ...extra }) as never;

test("matchPeople: name or email, A–Z; canCreatePerson ignores case and spaces", () => {
  const people = [p("1", "Raj Patel", { email: "raj@x.io" }), p("2", "Ana Ruiz")];
  assert.deepEqual(matchPeople(people, "").map((x: { id: string }) => x.id), ["2", "1"]);
  assert.deepEqual(matchPeople(people, "RAJ@").map((x: { id: string }) => x.id), ["1"]);
  assert.equal(canCreatePerson(people, "  ana   ruiz "), false);
  assert.equal(canCreatePerson(people, "Priya"), true);
  assert.equal(canCreatePerson(people, "   "), false);
});

test("teams: memberships first, primary team for older rows", () => {
  assert.deepEqual(teamsOf({ team_id: "t1", team_name: "Ops" }), [{ id: "t1", name: "Ops", title: null }]);
  const multi = { team_id: "t1", teams: [{ id: "t1", name: "Ops" }, { id: "t2", name: "Data", title: "Lead" }] };
  assert.equal(teamsOf(multi).length, 2);
  assert.equal(memberCount([multi, { team_id: "t2" }], "t2"), 2);
});

test("personOwns splits named records from team-led ones", () => {
  const items = [
    { object_id: "a", name: "CRM", type: "application", owned: true, roles: { business_owner: { team_id: "t", team_name: "Sales", contact_id: "c", contact_name: "Ana" } } },
    { object_id: "b", name: "ERP", type: "application", owned: true, roles: { support_team: { team_id: "t", team_name: "Sales", contact_id: "c", contact_is_lead: true } } },
    { object_id: "d", name: "BI", type: "application", owned: true, roles: { technical_owner: { contact_id: "x" } } },
  ] as ObjectOwnership[];
  const { direct, viaTeam } = personOwns(items, "c");
  assert.deepEqual(direct.map((r) => [r.item.name, r.roles[0]]), [["CRM", { role: "business_owner", team: "Sales" }]]);
  assert.deepEqual(viaTeam.map((r) => r.item.name), ["ERP"]);
  assert.deepEqual(teamsLedBy([{ id: "t", lead_contact_id: "c" }, { id: "u" }] as Team[], "c").map((t) => t.id), ["t"]);
  assert.equal(handoverSummary(2, 1), "Move 2 records, hand over 1 team");
  assert.equal(handoverSummary(1, 0), "Move 1 record");
});

test("old-roles review suggests the named assignee who is in People; also-linked line groups by verb", () => {
  const people = [p("c1", "Maya Chen")];
  const s = titleSuggestion([
    { team_id: "t0", team_name: "Ops", assignee_name: "Nobody", assignment_kind: "performer" },
    { team_id: "t1", team_name: "Data", assignee_name: "maya  chen", assignment_kind: "owner" },
  ], people);
  assert.deepEqual(s, { contactId: "c1", name: "Maya Chen", teamId: "t1", teamName: "Data" });
  assert.equal(titleSuggestion([], people), null);
  const line = alsoLinked([
    { link_kind: "informed", entity_name: "ERP" },
    { link_kind: "informed", entity_name: "CRM" },
    { link_kind: "approves", entity_name: "Payroll" },
  ]);
  assert.match(line, /CRM, ERP/);
  assert.ok(line.includes(" · "));
});
