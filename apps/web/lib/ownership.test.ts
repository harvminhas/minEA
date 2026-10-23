import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObjectOwnership } from "@minea/types";
import {
  categoriesIn,
  filterPicker,
  groupByType,
  holderLabel,
  ownedBy,
} from "./ownership";

const items: ObjectOwnership[] = [
  {
    object_id: "1",
    name: "CRM",
    type: "application",
    category: "Sales",
    owned: true,
    roles: {
      business_owner: { team_id: "t1", team_name: "Finance" },
      support_team: { team_id: "t1", team_name: "Finance" },
    },
  },
  {
    object_id: "2",
    name: "ERP",
    type: "application",
    category: "Finance",
    owned: false,
    roles: {},
  },
  {
    object_id: "3",
    name: "Billing",
    type: "capability",
    owned: true,
    roles: {
      technical_owner: {
        team_id: "t2",
        contact_id: "c1",
        contact_name: "Ana",
        contact_is_lead: true,
      },
    },
  },
  {
    object_id: "4",
    name: "Old",
    type: "application",
    owned: true,
    legacy_owner: "Old Dept",
    roles: {},
  },
];

test("owned objects list the roles held; a stand-in lead does not count", () => {
  assert.deepEqual(
    ownedBy(items, { type: "team", id: "t1" }).map((r) => r.roles),
    [["business_owner", "support_team"]],
  );
  assert.equal(ownedBy(items, { type: "contact", id: "c1" }).length, 0);
});

test("picker filters by text, unowned, type and application category", () => {
  const base = { q: "", unowned: false, type: "", category: "" };
  assert.deepEqual(
    filterPicker(items, { ...base, unowned: true }).map((i) => i.name),
    ["ERP"],
  );
  assert.deepEqual(
    filterPicker(items, { ...base, category: "Sales" }).map((i) => i.name),
    ["CRM"],
  );
  assert.deepEqual(
    filterPicker(items, { ...base, q: "bil", type: "capability" }).map(
      (i) => i.name,
    ),
    ["Billing"],
  );
  assert.deepEqual(categoriesIn(items), ["Finance", "Sales"]);
});

test("groups by type and labels holders", () => {
  const groups = groupByType(
    items,
    (i) => i.type,
    (i) => i.name,
  );
  assert.deepEqual(
    groups.map((g) => g.items.length),
    [3, 1],
  );
  assert.equal(holderLabel(items[2].roles.technical_owner), "Ana (lead)");
  assert.equal(holderLabel(items[0].roles.business_owner), "Finance");
});

test("team page lists technical-only and owner_team_id records of every type, with lead fallback", async () => {
  const { teamOwnedRows, membersOf, groupByType: group } = await import("./ownership");
  const rows: ObjectOwnership[] = [
    {
      object_id: "a",
      name: "Orders API",
      type: "api",
      owned: true,
      // owner_team_id only: the API reads it as Business owner
      roles: { business_owner: { team_id: "int", team_name: "Integration", contact_id: "p", contact_name: "Priya", contact_is_lead: true } },
    },
    {
      object_id: "b",
      name: "Customer API",
      type: "api",
      owned: true,
      roles: {
        business_owner: { team_id: "fin", team_name: "Finance" },
        technical_owner: { team_id: "int", team_name: "Integration", contact_id: "r", contact_name: "Raj" },
      },
    },
    { object_id: "c", name: "Kafka", type: "application", owned: true, roles: { support_team: { team_id: "int", team_name: "Integration" } } },
    { object_id: "d", name: "ERP", type: "application", owned: true, roles: { business_owner: { team_id: "fin", team_name: "Finance" } } },
  ];
  const owned = teamOwnedRows(rows, "int");
  assert.deepEqual(owned.map((r) => r.item.name).sort(), ["Customer API", "Kafka", "Orders API"]);
  assert.deepEqual(owned.find((r) => r.item.object_id === "b")!.roles, [{ role: "technical_owner", contact: "Raj", isLead: false }]);
  assert.deepEqual(owned.find((r) => r.item.object_id === "a")!.roles, [{ role: "business_owner", contact: "Priya", isLead: true }]);
  // Only types with items show up.
  assert.deepEqual(group(owned, (r) => r.item.type, (r) => r.item.name).map((g) => `${g.label} ${g.items.length}`), ["API 2", "Application 1"]);
  assert.equal(teamOwnedRows(rows, "nobody").length, 0);
  assert.equal(membersOf([{ team_id: "int" }, { team_id: "fin" }, { team_id: "int" }, {}], "int"), 2);
});
