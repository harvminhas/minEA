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
